import { PoolClient } from 'pg';
import { query } from '../db/index.js';
import {
  AttendanceReportRecord,
  AttendanceReportInput,
  ReportStatus,
  calculateAttendanceTotals,
} from '@ad-garments/domain';

export class AttendanceRepository {
  static async getDepartmentMap(factoryId: string) {
    const res = await query(
      `SELECT d.id, d.stable_code, d.visible_label, d.sort_order, u.stable_code as unit_code
       FROM departments d
       JOIN production_units u ON d.unit_id = u.id
       WHERE u.factory_id = $1 AND d.is_active = true
       ORDER BY u.sort_order, d.sort_order`,
      [factoryId]
    );

    const codeToId: Record<string, string> = {};
    const idToCode: Record<string, string> = {};
    const departments: Array<{
      id: string;
      code: string;
      label: string;
      unitCode: string;
      sortOrder: number;
    }> = [];

    for (const row of res.rows) {
      codeToId[row.stable_code] = row.id;
      idToCode[row.id] = row.stable_code;
      departments.push({
        id: row.id,
        code: row.stable_code,
        label: row.visible_label,
        unitCode: row.unit_code,
        sortOrder: row.sort_order,
      });
    }

    return { codeToId, idToCode, departments };
  }

  static async findById(
    id: string,
    factoryId: string,
    client?: PoolClient
  ): Promise<AttendanceReportRecord | null> {
    const runQuery = client ? (t: string, p?: any[]) => client.query(t, p) : query;
    const repRes = await runQuery(
      `SELECT r.*, a.staff_count, a.shift_count, a.is_staff_entered, a.is_shift_entered
       FROM attendance_reports r
       LEFT JOIN report_adjustments a ON r.id = a.report_id
       WHERE r.id = $1 AND r.factory_id = $2`,
      [id, factoryId]
    );

    if (repRes.rows.length === 0) return null;
    const row = repRes.rows[0];

    const entriesRes = await runQuery(
      `SELECT e.headcount, e.is_entered, d.stable_code
       FROM attendance_entries e
       JOIN departments d ON e.department_id = d.id
       WHERE e.report_id = $1`,
      [id]
    );

    const entries: Record<string, number> = {};
    for (const erow of entriesRes.rows) {
      if (erow.headcount !== null && erow.is_entered) {
        entries[erow.stable_code] = erow.headcount;
      }
    }

    const staff = row.staff_count ?? 0;
    const shift = row.shift_count ?? 0;
    const totals = calculateAttendanceTotals(entries, staff, shift);

    // Format report_date as YYYY-MM-DD
    const dateStr =
      typeof row.report_date === 'string'
        ? row.report_date.split('T')[0]
        : row.report_date instanceof Date
        ? `${row.report_date.getFullYear()}-${String(row.report_date.getMonth() + 1).padStart(2, '0')}-${String(row.report_date.getDate()).padStart(2, '0')}`
        : String(row.report_date).split('T')[0];

    return {
      id: row.id,
      factoryId: row.factory_id,
      reportDate: dateStr,
      status: row.status as ReportStatus,
      revision: row.revision,
      unit1Total: totals.unit1Total,
      unit2Total: totals.unit2Total,
      staffCount: staff,
      shiftCount: shift,
      grandTotal: totals.grandTotal,
      entries,
      createdBy: row.created_by,
      submittedBy: row.submitted_by,
      approvedBy: row.approved_by,
      submittedAt: row.submitted_at?.toISOString?.() ?? row.submitted_at,
      approvedAt: row.approved_at?.toISOString?.() ?? row.approved_at,
      createdAt: row.created_at?.toISOString?.() ?? row.created_at,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    };
  }

  static async findByDate(
    date: string,
    factoryId: string,
    client?: PoolClient
  ): Promise<AttendanceReportRecord | null> {
    const runQuery = client ? (t: string, p?: any[]) => client.query(t, p) : query;
    const repRes = await runQuery(
      `SELECT id FROM attendance_reports WHERE factory_id = $1 AND report_date = $2`,
      [factoryId, date]
    );
    if (repRes.rows.length === 0) return null;
    return this.findById(repRes.rows[0].id, factoryId, client);
  }

  static async findByDateRange(
    fromDate: string,
    toDate: string,
    factoryId: string
  ): Promise<AttendanceReportRecord[]> {
    const res = await query(
      `SELECT id FROM attendance_reports
       WHERE factory_id = $1 AND report_date >= $2 AND report_date <= $3
       ORDER BY report_date ASC`,
      [factoryId, fromDate, toDate]
    );

    const records: AttendanceReportRecord[] = [];
    for (const r of res.rows) {
      const rec = await this.findById(r.id, factoryId);
      if (rec) records.push(rec);
    }
    return records;
  }

  static async createReport(
    client: PoolClient,
    input: AttendanceReportInput,
    userId: string,
    factoryId: string,
    codeToId: Record<string, string>
  ): Promise<AttendanceReportRecord> {
    const repRes = await client.query(
      `INSERT INTO attendance_reports (id, factory_id, report_date, status, revision, created_by, updated_at)
       VALUES ($1, $2, $3, $4, 1, $5, NOW())
       RETURNING *`,
      [input.id, factoryId, input.reportDate, input.status || 'DRAFT', userId]
    );

    await client.query(
      `INSERT INTO report_adjustments (report_id, staff_count, shift_count, is_staff_entered, is_shift_entered)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.id,
        input.staffCount,
        input.shiftCount,
        input.staffCount !== null,
        input.shiftCount !== null,
      ]
    );

    for (const [deptCode, count] of Object.entries(input.entries)) {
      const deptId = codeToId[deptCode];
      if (deptId) {
        await client.query(
          `INSERT INTO attendance_entries (report_id, department_id, headcount, is_entered)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (report_id, department_id) DO UPDATE
           SET headcount = EXCLUDED.headcount, is_entered = EXCLUDED.is_entered`,
          [input.id, deptId, count, count !== null]
        );
      }
    }

    // Record audit event
    await client.query(
      `INSERT INTO audit_events (report_id, actor_id, action, revision, change_summary)
       VALUES ($1, $2, 'CREATE_REPORT', 1, $3)`,
      [input.id, userId, JSON.stringify({ initialStatus: input.status || 'DRAFT' })]
    );

    return (await this.findById(input.id, factoryId, client))!;
  }

  static async updateReport(
    client: PoolClient,
    id: string,
    factoryId: string,
    input: Partial<AttendanceReportInput>,
    userId: string,
    expectedRevision: number,
    codeToId: Record<string, string>
  ): Promise<{ updated: AttendanceReportRecord; conflict: boolean; currentRevision: number }> {
    // Check current revision
    const currRes = await client.query(
      `SELECT revision, status FROM attendance_reports WHERE id = $1 AND factory_id = $2 FOR UPDATE`,
      [id, factoryId]
    );

    if (currRes.rows.length === 0) {
      throw new Error(`Report not found: ${id}`);
    }

    const currentRevision = currRes.rows[0].revision;
    if (expectedRevision !== currentRevision) {
      return {
        updated: (await this.findById(id, factoryId, client))!,
        conflict: true,
        currentRevision,
      };
    }

    const newRevision = currentRevision + 1;

    await client.query(
      `UPDATE attendance_reports
       SET revision = $1, status = COALESCE($2, status), updated_at = NOW()
       WHERE id = $3 AND factory_id = $4`,
      [newRevision, input.status, id, factoryId]
    );

    if (input.staffCount !== undefined || input.shiftCount !== undefined) {
      await client.query(
        `INSERT INTO report_adjustments (report_id, staff_count, shift_count, is_staff_entered, is_shift_entered)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (report_id) DO UPDATE
         SET staff_count = COALESCE(EXCLUDED.staff_count, report_adjustments.staff_count),
             shift_count = COALESCE(EXCLUDED.shift_count, report_adjustments.shift_count),
             is_staff_entered = CASE WHEN EXCLUDED.staff_count IS NOT NULL THEN true ELSE report_adjustments.is_staff_entered END,
             is_shift_entered = CASE WHEN EXCLUDED.shift_count IS NOT NULL THEN true ELSE report_adjustments.is_shift_entered END`,
        [
          id,
          input.staffCount ?? null,
          input.shiftCount ?? null,
          input.staffCount !== null && input.staffCount !== undefined,
          input.shiftCount !== null && input.shiftCount !== undefined,
        ]
      );
    }

    if (input.entries) {
      for (const [deptCode, count] of Object.entries(input.entries)) {
        const deptId = codeToId[deptCode];
        if (deptId) {
          await client.query(
            `INSERT INTO attendance_entries (report_id, department_id, headcount, is_entered)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (report_id, department_id) DO UPDATE
             SET headcount = EXCLUDED.headcount, is_entered = EXCLUDED.is_entered`,
            [id, deptId, count, count !== null]
          );
        }
      }
    }

    // Audit event
    await client.query(
      `INSERT INTO audit_events (report_id, actor_id, action, revision, change_summary)
       VALUES ($1, $2, 'UPDATE_REPORT', $3, $4)`,
      [id, userId, newRevision, JSON.stringify({ revision: newRevision, status: input.status })]
    );

    const updated = (await this.findById(id, factoryId, client))!;
    return { updated, conflict: false, currentRevision: newRevision };
  }

  static async submitReport(
    client: PoolClient,
    id: string,
    factoryId: string,
    userId: string,
    expectedRevision: number
  ) {
    const currRes = await client.query(
      `SELECT revision, status FROM attendance_reports WHERE id = $1 AND factory_id = $2 FOR UPDATE`,
      [id, factoryId]
    );
    if (currRes.rows.length === 0) throw new Error('Report not found');
    const currentRevision = currRes.rows[0].revision;
    if (expectedRevision !== currentRevision) {
      return { conflict: true, currentRevision };
    }

    const newRevision = currentRevision + 1;
    await client.query(
      `UPDATE attendance_reports
       SET status = 'SUBMITTED', revision = $1, submitted_by = $2, submitted_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND factory_id = $4`,
      [newRevision, userId, id, factoryId]
    );

    await client.query(
      `INSERT INTO audit_events (report_id, actor_id, action, revision, change_summary)
       VALUES ($1, $2, 'SUBMIT_REPORT', $3, '{}')`,
      [id, userId, newRevision]
    );

    return { conflict: false, currentRevision: newRevision };
  }

  static async approveReport(
    client: PoolClient,
    id: string,
    factoryId: string,
    userId: string
  ) {
    const currRes = await client.query(
      `SELECT revision, status FROM attendance_reports WHERE id = $1 AND factory_id = $2 FOR UPDATE`,
      [id, factoryId]
    );
    if (currRes.rows.length === 0) throw new Error('Report not found');
    const newRevision = currRes.rows[0].revision + 1;

    await client.query(
      `UPDATE attendance_reports
       SET status = 'APPROVED', revision = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND factory_id = $4`,
      [newRevision, userId, id, factoryId]
    );

    await client.query(
      `INSERT INTO audit_events (report_id, actor_id, action, revision, change_summary)
       VALUES ($1, $2, 'APPROVE_REPORT', $3, '{}')`,
      [id, userId, newRevision]
    );

    return (await this.findById(id, factoryId, client))!;
  }

  static async reopenReport(
    client: PoolClient,
    id: string,
    factoryId: string,
    userId: string
  ) {
    const currRes = await client.query(
      `SELECT revision, status FROM attendance_reports WHERE id = $1 AND factory_id = $2 FOR UPDATE`,
      [id, factoryId]
    );
    if (currRes.rows.length === 0) throw new Error('Report not found');
    const newRevision = currRes.rows[0].revision + 1;

    await client.query(
      `UPDATE attendance_reports
       SET status = 'REOPENED', revision = $1, updated_at = NOW()
       WHERE id = $2 AND factory_id = $3`,
      [newRevision, id, factoryId]
    );

    await client.query(
      `INSERT INTO audit_events (report_id, actor_id, action, revision, change_summary)
       VALUES ($1, $2, 'REOPEN_REPORT', $3, '{}')`,
      [id, userId, newRevision]
    );

    return (await this.findById(id, factoryId, client))!;
  }

  static async getAuditEvents(reportId: string) {
    const res = await query(
      `SELECT a.*, u.display_name as actor_name, u.role as actor_role
       FROM audit_events a
       JOIN users u ON a.actor_id = u.id
       WHERE a.report_id = $1
       ORDER BY a.revision ASC, a.created_at ASC`,
      [reportId]
    );
    return res.rows;
  }
}
