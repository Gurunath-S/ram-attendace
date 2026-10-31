export type UserRole = 'SUPERVISOR' | 'MANAGER' | 'ADMIN';

export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REOPENED';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

export interface DepartmentConfig {
  code: string;
  label: string;
  unit: 'UNIT-1' | 'UNIT-2';
  order: number;
}

export const UNIT_1_DEPARTMENTS: DepartmentConfig[] = [
  { code: 'U1_SINGER_1', label: 'SINGER', unit: 'UNIT-1', order: 1 },
  { code: 'U1_FLATLOCK', label: 'FLATLOCK', unit: 'UNIT-1', order: 2 },
  { code: 'U1_OVERLOCK', label: 'OVERLOCK', unit: 'UNIT-1', order: 3 },
  { code: 'U1_HELPER', label: 'HELPER', unit: 'UNIT-1', order: 4 },
  { code: 'U1_SINGER_2', label: 'SINGER', unit: 'UNIT-1', order: 5 },
  { code: 'U1_CHECKING', label: 'CHECKING', unit: 'UNIT-1', order: 6 },
  { code: 'U1_IRONING', label: 'IRONING', unit: 'UNIT-1', order: 7 },
  { code: 'U1_PACKING', label: 'PACKING', unit: 'UNIT-1', order: 8 },
];

export const UNIT_2_DEPARTMENTS: DepartmentConfig[] = [
  { code: 'U2_CUTTING', label: 'CUTTING', unit: 'UNIT-2', order: 1 },
  { code: 'U2_FLATLOCK', label: 'FLATLOCK', unit: 'UNIT-2', order: 2 },
  { code: 'U2_OVERLOCK', label: 'OVERLOCK', unit: 'UNIT-2', order: 3 },
  { code: 'U2_HELPER', label: 'HELPER', unit: 'UNIT-2', order: 4 },
  { code: 'U2_SINGER_CO_SHIFT', label: 'SINGER CO.SHIFT', unit: 'UNIT-2', order: 5 },
  { code: 'U2_CHECKING', label: 'CHECKING', unit: 'UNIT-2', order: 6 },
  { code: 'U2_IRONING', label: 'IRONING', unit: 'UNIT-2', order: 7 },
  { code: 'U2_PACKING', label: 'PACKING', unit: 'UNIT-2', order: 8 },
];

export const ALL_DEPARTMENTS: DepartmentConfig[] = [
  ...UNIT_1_DEPARTMENTS,
  ...UNIT_2_DEPARTMENTS,
];

export type DepartmentCode =
  | 'U1_SINGER_1'
  | 'U1_FLATLOCK'
  | 'U1_OVERLOCK'
  | 'U1_HELPER'
  | 'U1_SINGER_2'
  | 'U1_CHECKING'
  | 'U1_IRONING'
  | 'U1_PACKING'
  | 'U2_CUTTING'
  | 'U2_FLATLOCK'
  | 'U2_OVERLOCK'
  | 'U2_HELPER'
  | 'U2_SINGER_CO_SHIFT'
  | 'U2_CHECKING'
  | 'U2_IRONING'
  | 'U2_PACKING';

export interface AttendanceEntryInput {
  departmentCode: string;
  headcount: number | null; // null represents empty/unentered in draft
}

export interface AttendanceReportInput {
  id: string; // client-generated UUID
  factoryId: string;
  reportDate: string; // YYYY-MM-DD in Asia/Kolkata timezone
  entries: Record<string, number | null>; // departmentCode -> headcount
  staffCount: number | null; // UNIT-1 STAFF count
  shiftCount: number | null; // UNIT-2 SHIFT count
  status?: ReportStatus;
  revision?: number;
}

export interface CalculatedReportTotals {
  unit1Total: number;
  unit2Total: number;
  staffCount: number;
  shiftCount: number;
  grandTotal: number;
  isComplete: boolean;
  missingFields: string[];
}

export interface AttendanceReportRecord {
  id: string;
  factoryId: string;
  reportDate: string;
  status: ReportStatus;
  revision: number;
  unit1Total: number;
  unit2Total: number;
  staffCount: number;
  shiftCount: number;
  grandTotal: number;
  entries: Record<string, number>;
  createdBy: string;
  submittedBy?: string | null;
  approvedBy?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncOperation {
  operationId: string;
  reportId: string;
  userId: string;
  operationType: 'CREATE' | 'UPDATE' | 'SUBMIT' | 'APPROVE' | 'REOPEN';
  baseRevision: number;
  payload: AttendanceReportInput;
  createdAt: string;
  retryCount: number;
  lastAttemptAt?: string;
  status: SyncStatus;
  errorMessage?: string;
}
