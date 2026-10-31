import { withTransaction, query } from '../db/index.js';
import { AttendanceRepository } from '../repositories/attendanceRepository.js';
import { AttendanceService } from './attendanceService.js';
import { SyncOperation, AttendanceReportRecord } from '@ad-garments/domain';
import { AuthUser } from '../middleware/auth.js';

export interface SyncPushResult {
  operationId: string;
  status: 'PROCESSED' | 'IDEMPOTENT_HIT' | 'CONFLICT' | 'ERROR';
  serverRevision?: number;
  report?: AttendanceReportRecord | null;
  errorMessage?: string;
}

export class SyncService {
  static async processOperation(
    user: AuthUser,
    op: SyncOperation
  ): Promise<SyncPushResult> {
    // 1. Check idempotency
    const existingOp = await query(
      `SELECT * FROM sync_operations WHERE operation_id = $1`,
      [op.operationId]
    );

    if (existingOp.rows.length > 0) {
      const stored = existingOp.rows[0];
      const outcome = stored.stored_outcome || {};
      const latestReport = await AttendanceRepository.findById(op.reportId, user.factoryId);
      return {
        operationId: op.operationId,
        status: 'IDEMPOTENT_HIT',
        serverRevision: latestReport?.revision ?? outcome.revision,
        report: latestReport,
      };
    }

    // 2. Execute operation inside transaction
    return withTransaction(async (client) => {
      const { codeToId } = await AttendanceRepository.getDepartmentMap(user.factoryId);
      const existingReport = await AttendanceRepository.findById(op.reportId, user.factoryId, client);

      try {
        let finalReport: AttendanceReportRecord;

        if (op.operationType === 'CREATE' && !existingReport) {
          finalReport = await AttendanceRepository.createReport(
            client,
            op.payload,
            user.id,
            user.factoryId,
            codeToId
          );
        } else {
          // UPDATE / CREATE for existing report
          if (!existingReport) {
            throw new Error(`Report not found for operation ${op.operationType}: ${op.reportId}`);
          }

          if (op.baseRevision !== existingReport.revision) {
            // Stale revision conflict
            const conflictResult: SyncPushResult = {
              operationId: op.operationId,
              status: 'CONFLICT',
              serverRevision: existingReport.revision,
              report: existingReport,
              errorMessage: `Revision mismatch: client sent ${op.baseRevision}, server has ${existingReport.revision}`,
            };

            await client.query(
              `INSERT INTO sync_operations (operation_id, report_id, user_id, operation_type, base_revision, processing_status, stored_outcome)
               VALUES ($1, $2, $3, $4, $5, 'CONFLICT', $6)`,
              [
                op.operationId,
                op.reportId,
                user.id,
                op.operationType,
                op.baseRevision,
                JSON.stringify(conflictResult),
              ]
            );

            return conflictResult;
          }

          if (op.operationType === 'SUBMIT') {
            await AttendanceRepository.submitReport(
              client,
              op.reportId,
              user.factoryId,
              user.id,
              op.baseRevision
            );
            finalReport = (await AttendanceRepository.findById(op.reportId, user.factoryId, client))!;
          } else if (op.operationType === 'APPROVE') {
            finalReport = await AttendanceRepository.approveReport(
              client,
              op.reportId,
              user.factoryId,
              user.id
            );
          } else if (op.operationType === 'REOPEN') {
            finalReport = await AttendanceRepository.reopenReport(
              client,
              op.reportId,
              user.factoryId,
              user.id
            );
          } else {
            // Standard update
            const updateResult = await AttendanceRepository.updateReport(
              client,
              op.reportId,
              user.factoryId,
              op.payload,
              user.id,
              op.baseRevision,
              codeToId
            );
            finalReport = updateResult.updated;
          }
        }

        const successResult: SyncPushResult = {
          operationId: op.operationId,
          status: 'PROCESSED',
          serverRevision: finalReport.revision,
          report: finalReport,
        };

        await client.query(
          `INSERT INTO sync_operations (operation_id, report_id, user_id, operation_type, base_revision, processing_status, stored_outcome)
           VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6)`,
          [
            op.operationId,
            op.reportId,
            user.id,
            op.operationType,
            op.baseRevision,
            JSON.stringify(successResult),
          ]
        );

        return successResult;
      } catch (err: any) {
        return {
          operationId: op.operationId,
          status: 'ERROR',
          errorMessage: err.message,
        };
      }
    });
  }

  static async getChanges(factoryId: string, cursorDate?: string) {
    const fromDate = cursorDate || '2026-01-01';
    const res = await query(
      `SELECT id FROM attendance_reports
       WHERE factory_id = $1 AND updated_at >= $2
       ORDER BY updated_at ASC LIMIT 100`,
      [factoryId, fromDate]
    );

    const reports: AttendanceReportRecord[] = [];
    for (const r of res.rows) {
      const rep = await AttendanceRepository.findById(r.id, factoryId);
      if (rep) reports.push(rep);
    }

    return {
      reports,
      nextCursor: new Date().toISOString(),
    };
  }
}
