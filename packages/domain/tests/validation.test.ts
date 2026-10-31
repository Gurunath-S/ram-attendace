import { describe, it, expect } from 'vitest';
import {
  AttendanceDraftInputSchema,
  AttendanceSubmitInputSchema,
  canCreateDraft,
  canSubmitReport,
  canApproveReport,
  canReopenReport,
} from '../src/validation.js';
import { getWeekBounds, getWeekDates, getMonthBounds } from '../src/date-rules.js';

describe('Validation & RBAC Tests', () => {
  const validDraft = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    factoryId: 'factory-1',
    reportDate: '2026-10-20',
    entries: {
      U1_SINGER_1: 4,
      U1_FLATLOCK: null,
    },
    staffCount: null,
    shiftCount: 5,
  };

  it('validates a draft with partial and null entries successfully', () => {
    const parseResult = AttendanceDraftInputSchema.safeParse(validDraft);
    expect(parseResult.success).toBe(true);
  });

  it('rejects draft with invalid date or negative count', () => {
    const invalidDateDraft = { ...validDraft, reportDate: '2026-02-30' }; // Invalid date
    expect(AttendanceDraftInputSchema.safeParse(invalidDateDraft).success).toBe(false);

    const negativeCountDraft = {
      ...validDraft,
      entries: { U1_SINGER_1: -5 },
    };
    expect(AttendanceDraftInputSchema.safeParse(negativeCountDraft).success).toBe(false);
  });

  it('requires all 16 departments, STAFF, and SHIFT to submit a report', () => {
    const incompleteSubmit = { ...validDraft };
    const result = AttendanceSubmitInputSchema.safeParse(incompleteSubmit);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issuePaths = result.error.issues.map((i) => i.path.join('.'));
      expect(issuePaths).toContain('entries.U1_FLATLOCK');
      expect(issuePaths).toContain('staffCount');
    }
  });

  it('accepts complete submission with all 16 departments and adjustment fields', () => {
    const completeEntries: Record<string, number> = {
      U1_SINGER_1: 4,
      U1_FLATLOCK: 3,
      U1_OVERLOCK: 3,
      U1_HELPER: 2,
      U1_SINGER_2: 4,
      U1_CHECKING: 3,
      U1_IRONING: 3,
      U1_PACKING: 2,
      U2_CUTTING: 6,
      U2_FLATLOCK: 6,
      U2_OVERLOCK: 6,
      U2_HELPER: 5,
      U2_SINGER_CO_SHIFT: 5,
      U2_CHECKING: 5,
      U2_IRONING: 5,
      U2_PACKING: 4,
    };

    const completeSubmit = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      factoryId: 'factory-1',
      reportDate: '2026-10-20',
      entries: completeEntries,
      staffCount: 2,
      shiftCount: 7,
    };

    const result = AttendanceSubmitInputSchema.safeParse(completeSubmit);
    expect(result.success).toBe(true);
  });

  it('enforces RBAC permissions correctly', () => {
    expect(canCreateDraft('SUPERVISOR')).toBe(true);
    expect(canSubmitReport('SUPERVISOR')).toBe(true);
    expect(canApproveReport('SUPERVISOR')).toBe(false);
    expect(canReopenReport('SUPERVISOR')).toBe(false);

    expect(canApproveReport('MANAGER')).toBe(true);
    expect(canReopenReport('MANAGER')).toBe(true);
    expect(canApproveReport('ADMIN')).toBe(true);
  });

  it('computes week and month bounds accurately', () => {
    // 2026-10-20 is a Tuesday. Monday should be 2026-10-19, Sunday 2026-10-25.
    const week = getWeekBounds('2026-10-20');
    expect(week.weekStart).toBe('2026-10-19');
    expect(week.weekEnd).toBe('2026-10-25');

    const weekDates = getWeekDates(week.weekStart);
    expect(weekDates).toHaveLength(7);
    expect(weekDates[0]).toBe('2026-10-19');
    expect(weekDates[6]).toBe('2026-10-25');

    const month = getMonthBounds('2026-10');
    expect(month.monthStart).toBe('2026-10-01');
    expect(month.monthEnd).toBe('2026-10-31');
    expect(month.totalDays).toBe(31);
  });
});
