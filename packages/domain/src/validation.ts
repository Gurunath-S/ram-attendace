import { z } from 'zod';
import {
  ALL_DEPARTMENTS,
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
  UserRole,
} from './attendance-types.js';

export const NonNegativeIntegerSchema = z
  .number()
  .int('Count must be an integer')
  .min(0, 'Count must be non-negative')
  .max(100000, 'Count exceeds realistic factory headcount limit');

export const DraftCountSchema = z.union([
  NonNegativeIntegerSchema,
  z.null(),
]);

export const ReportDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
  .refine((dateStr) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
  }, 'Invalid calendar date');

export const AttendanceDraftInputSchema = z.object({
  id: z.string().uuid('ID must be a valid UUID'),
  factoryId: z.string().min(1, 'Factory ID is required'),
  reportDate: ReportDateSchema,
  entries: z.record(z.string(), DraftCountSchema),
  staffCount: DraftCountSchema,
  shiftCount: DraftCountSchema,
  revision: z.number().int().min(1).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REOPENED']).optional(),
});

export const AttendanceSubmitInputSchema = AttendanceDraftInputSchema.superRefine((val, ctx) => {
  for (const dept of ALL_DEPARTMENTS) {
    const count = val.entries[dept.code];
    if (count === null || count === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Field ${dept.label} (${dept.code}) must be explicitly entered before submission`,
        path: ['entries', dept.code],
      });
    }
  }

  if (val.staffCount === null || val.staffCount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'STAFF count must be explicitly entered before submission',
      path: ['staffCount'],
    });
  }

  if (val.shiftCount === null || val.shiftCount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SHIFT count must be explicitly entered before submission',
      path: ['shiftCount'],
    });
  }
});

/**
 * Role-Based Access Control logic
 */
export function canCreateDraft(role: UserRole): boolean {
  return role === 'SUPERVISOR' || role === 'MANAGER' || role === 'ADMIN';
}

export function canSubmitReport(role: UserRole): boolean {
  return role === 'SUPERVISOR' || role === 'MANAGER' || role === 'ADMIN';
}

export function canApproveReport(role: UserRole): boolean {
  return role === 'MANAGER' || role === 'ADMIN';
}

export function canReopenReport(role: UserRole): boolean {
  return role === 'MANAGER' || role === 'ADMIN';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function canConfigureDepartments(role: UserRole): boolean {
  return role === 'ADMIN';
}
