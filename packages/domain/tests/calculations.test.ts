import { describe, it, expect } from 'vitest';
import {
  calculateAttendanceTotals,
  sanitizeCount,
  InvalidCountError,
} from '../src/calculations.js';
import { UNIT_1_DEPARTMENTS, UNIT_2_DEPARTMENTS } from '../src/attendance-types.js';

describe('Attendance Calculations & Acceptance Tests', () => {
  it('October 20, 2026: matches exact required totals (Unit1: 24, Unit2: 42, STAFF: 2, SHIFT: 7 => GRAND TOTAL: 75)', () => {
    // UNIT-1 8 departments summing to 24
    // e.g., 3 each for 8 depts = 24
    const unit1Entries: Record<string, number> = {
      U1_SINGER_1: 4,
      U1_FLATLOCK: 3,
      U1_OVERLOCK: 3,
      U1_HELPER: 2,
      U1_SINGER_2: 4,
      U1_CHECKING: 3,
      U1_IRONING: 3,
      U1_PACKING: 2,
    };

    // UNIT-2 8 departments summing to 42
    const unit2Entries: Record<string, number> = {
      U2_CUTTING: 6,
      U2_FLATLOCK: 6,
      U2_OVERLOCK: 6,
      U2_HELPER: 5,
      U2_SINGER_CO_SHIFT: 5,
      U2_CHECKING: 5,
      U2_IRONING: 5,
      U2_PACKING: 4,
    };

    const entries = { ...unit1Entries, ...unit2Entries };
    const staff = 2;
    const shift = 7;

    const result = calculateAttendanceTotals(entries, staff, shift);

    expect(result.unit1Total).toBe(24);
    expect(result.unit2Total).toBe(42);
    expect(result.staffCount).toBe(2);
    expect(result.shiftCount).toBe(7);
    expect(result.grandTotal).toBe(75);
    expect(result.isComplete).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('October 21, 2026: matches exact required totals (Unit1: 25, Unit2: 50, STAFF: 3, SHIFT: 8 => GRAND TOTAL: 86)', () => {
    // UNIT-1 8 departments summing to 25
    const unit1Entries: Record<string, number> = {
      U1_SINGER_1: 4,
      U1_FLATLOCK: 3,
      U1_OVERLOCK: 4,
      U1_HELPER: 3,
      U1_SINGER_2: 3,
      U1_CHECKING: 3,
      U1_IRONING: 3,
      U1_PACKING: 2,
    };

    // UNIT-2 8 departments summing to 50
    const unit2Entries: Record<string, number> = {
      U2_CUTTING: 7,
      U2_FLATLOCK: 7,
      U2_OVERLOCK: 7,
      U2_HELPER: 6,
      U2_SINGER_CO_SHIFT: 6,
      U2_CHECKING: 6,
      U2_IRONING: 6,
      U2_PACKING: 5,
    };

    const entries = { ...unit1Entries, ...unit2Entries };
    const staff = 3;
    const shift = 8;

    const result = calculateAttendanceTotals(entries, staff, shift);

    expect(result.unit1Total).toBe(25);
    expect(result.unit2Total).toBe(50);
    expect(result.staffCount).toBe(3);
    expect(result.shiftCount).toBe(8);
    expect(result.grandTotal).toBe(86);
    expect(result.isComplete).toBe(true);
  });

  it('preserves distinct SINGER rows in UNIT-1 (U1_SINGER_1 and U1_SINGER_2)', () => {
    const entries: Record<string, number> = {
      U1_SINGER_1: 10,
      U1_FLATLOCK: 0,
      U1_OVERLOCK: 0,
      U1_HELPER: 0,
      U1_SINGER_2: 5,
      U1_CHECKING: 0,
      U1_IRONING: 0,
      U1_PACKING: 0,
    };

    const result = calculateAttendanceTotals(entries, 0, 0);
    expect(result.unit1Total).toBe(15);
  });

  it('handles partial draft entries and reports missing fields correctly', () => {
    const entries: Record<string, number | null> = {
      U1_SINGER_1: 5,
      U1_FLATLOCK: null, // missing
    };

    const result = calculateAttendanceTotals(entries, null, 2);

    expect(result.unit1Total).toBe(5);
    expect(result.unit2Total).toBe(0);
    expect(result.staffCount).toBe(0);
    expect(result.shiftCount).toBe(2);
    expect(result.grandTotal).toBe(7);
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain('U1_FLATLOCK');
    expect(result.missingFields).toContain('STAFF');
  });

  it('distinguishes explicit zero from unentered (null)', () => {
    expect(sanitizeCount(0, 'test')).toBe(0);
    expect(sanitizeCount('0', 'test')).toBe(0);
    expect(sanitizeCount(null, 'test')).toBeNull();
    expect(sanitizeCount(undefined, 'test')).toBeNull();
    expect(sanitizeCount('', 'test')).toBeNull();
  });

  it('rejects negative numbers, decimals, NaN, Infinity', () => {
    expect(() => sanitizeCount(-1, 'test')).toThrow(InvalidCountError);
    expect(() => sanitizeCount(3.14, 'test')).toThrow(InvalidCountError);
    expect(() => sanitizeCount('abc', 'test')).toThrow(InvalidCountError);
    expect(() => sanitizeCount(Infinity, 'test')).toThrow(InvalidCountError);
  });
});
