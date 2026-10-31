import {
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
  CalculatedReportTotals,
} from './attendance-types.js';

export class InvalidCountError extends Error {
  constructor(public readonly field: string, public readonly value: unknown, message: string) {
    super(message);
    this.name = 'InvalidCountError';
  }
}

/**
 * Validates that a value is either null/undefined (empty) or a non-negative safe integer.
 */
export function sanitizeCount(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = typeof value === 'string' ? Number(value.trim()) : Number(value);

  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new InvalidCountError(fieldName, value, `Count for ${fieldName} must be a valid number`);
  }

  if (!Number.isInteger(num)) {
    throw new InvalidCountError(fieldName, value, `Count for ${fieldName} must be an integer`);
  }

  if (num < 0) {
    throw new InvalidCountError(fieldName, value, `Count for ${fieldName} cannot be negative`);
  }

  if (!Number.isSafeInteger(num)) {
    throw new InvalidCountError(fieldName, value, `Count for ${fieldName} exceeds safe integer limits`);
  }

  return num;
}

/**
 * Deterministically calculates Unit-1 Total, Unit-2 Total, and Grand Total.
 * GRAND TOTAL = UNIT-1 TOTAL + UNIT-2 TOTAL + STAFF + SHIFT.
 * Tracks completion status and missing fields.
 */
export function calculateAttendanceTotals(
  entries: Record<string, number | null | undefined>,
  staffCount: number | null | undefined,
  shiftCount: number | null | undefined
): CalculatedReportTotals {
  const missingFields: string[] = [];

  let unit1Total = 0;
  for (const dept of UNIT_1_DEPARTMENTS) {
    const rawVal = entries[dept.code];
    const val = sanitizeCount(rawVal, dept.code);
    if (val === null) {
      missingFields.push(dept.code);
    } else {
      unit1Total += val;
    }
  }

  let unit2Total = 0;
  for (const dept of UNIT_2_DEPARTMENTS) {
    const rawVal = entries[dept.code];
    const val = sanitizeCount(rawVal, dept.code);
    if (val === null) {
      missingFields.push(dept.code);
    } else {
      unit2Total += val;
    }
  }

  const cleanStaff = sanitizeCount(staffCount, 'STAFF');
  if (cleanStaff === null) {
    missingFields.push('STAFF');
  }

  const cleanShift = sanitizeCount(shiftCount, 'SHIFT');
  if (cleanShift === null) {
    missingFields.push('SHIFT');
  }

  const staffValue = cleanStaff ?? 0;
  const shiftValue = cleanShift ?? 0;

  const grandTotal = unit1Total + unit2Total + staffValue + shiftValue;

  return {
    unit1Total,
    unit2Total,
    staffCount: staffValue,
    shiftCount: shiftValue,
    grandTotal,
    isComplete: missingFields.length === 0,
    missingFields,
  };
}
