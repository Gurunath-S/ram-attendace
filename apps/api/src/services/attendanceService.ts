import { withTransaction } from '../db/index.js';
import { AttendanceRepository } from '../repositories/attendanceRepository.js';
import {
  AttendanceReportInput,
  AttendanceDraftInputSchema,
  AttendanceSubmitInputSchema,
  canSubmitReport,
  canApproveReport,
  canReopenReport,
  calculateAttendanceTotals,
} from '@ad-garments/domain';
import { AppError } from '../middleware/errorHandler.js';
import { AuthUser } from '../middleware/auth.js';

export class AttendanceService {
  static async getById(id: string, factoryId: string) {
    const report = await AttendanceRepository.findById(id, factoryId);
    if (!report) throw new AppError(404, 'Attendance report not found');
    return report;
  }

  static async getByDate(date: string, factoryId: string) {
    return AttendanceRepository.findByDate(date, factoryId);
  }

  static async getByDateRange(from: string, to: string, factoryId: string) {
    return AttendanceRepository.findByDateRange(from, to, factoryId);
  }

  static async saveDraft(user: AuthUser, input: AttendanceReportInput) {
    // Validate draft
    const parsed = AttendanceDraftInputSchema.parse(input);

    return withTransaction(async (client) => {
      const { codeToId } = await AttendanceRepository.getDepartmentMap(user.factoryId);

      // Check if report already exists for this id
      const existing = await AttendanceRepository.findById(parsed.id, user.factoryId);
      if (existing) {
        if (existing.status === 'APPROVED' && user.role === 'SUPERVISOR') {
          throw new AppError(403, 'Approved reports cannot be modified by supervisors');
        }

        const expectedRev = parsed.revision ?? existing.revision;
        const result = await AttendanceRepository.updateReport(
          client,
          parsed.id,
          user.factoryId,
          parsed,
          user.id,
          expectedRev,
          codeToId
        );

        if (result.conflict) {
          throw new AppError(409, 'Conflict: Stale report revision', {
            serverRevision: result.currentRevision,
            serverReport: result.updated,
          });
        }
        return result.updated;
      }

      // Check if report already exists for this date
      const dateExisting = await AttendanceRepository.findByDate(parsed.reportDate, user.factoryId);
      if (dateExisting) {
        throw new AppError(
          409,
          `A report already exists for date ${parsed.reportDate} (ID: ${dateExisting.id})`
        );
      }

      return AttendanceRepository.createReport(
        client,
        parsed,
        user.id,
        user.factoryId,
        codeToId
      );
    });
  }

  static async submitReport(user: AuthUser, id: string, expectedRevision: number) {
    if (!canSubmitReport(user.role)) {
      throw new AppError(403, 'Permission denied: Cannot submit report');
    }

    const report = await AttendanceRepository.findById(id, user.factoryId);
    if (!report) throw new AppError(404, 'Report not found');

    if (report.status === 'APPROVED') {
      throw new AppError(400, 'Report is already approved');
    }

    // Validation for submission: all 16 departments + staff + shift must be entered
    const submitPayload = {
      id: report.id,
      factoryId: report.factoryId,
      reportDate: report.reportDate,
      entries: report.entries,
      staffCount: report.staffCount,
      shiftCount: report.shiftCount,
    };
    AttendanceSubmitInputSchema.parse(submitPayload);

    return withTransaction(async (client) => {
      const result = await AttendanceRepository.submitReport(
        client,
        id,
        user.factoryId,
        user.id,
        expectedRevision
      );

      if (result.conflict) {
        throw new AppError(409, 'Conflict: Stale report revision', {
          serverRevision: result.currentRevision,
        });
      }

      return AttendanceRepository.findById(id, user.factoryId, client);
    });
  }

  static async approveReport(user: AuthUser, id: string) {
    if (!canApproveReport(user.role)) {
      throw new AppError(403, 'Permission denied: Only managers and admins can approve reports');
    }

    return withTransaction(async (client) => {
      return AttendanceRepository.approveReport(client, id, user.factoryId, user.id);
    });
  }

  static async reopenReport(user: AuthUser, id: string) {
    if (!canReopenReport(user.role)) {
      throw new AppError(403, 'Permission denied: Only managers and admins can reopen reports');
    }

    return withTransaction(async (client) => {
      return AttendanceRepository.reopenReport(client, id, user.factoryId, user.id);
    });
  }

  static async getAuditHistory(user: AuthUser, reportId: string) {
    const report = await AttendanceRepository.findById(reportId, user.factoryId);
    if (!report) throw new AppError(404, 'Report not found');
    return AttendanceRepository.getAuditEvents(reportId);
  }
}
