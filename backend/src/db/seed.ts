import bcrypt from 'bcryptjs';
import { query, withTransaction, pool } from './index.js';
import {
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
  ALL_DEPARTMENTS,
} from '@ad-garments/domain';

export async function runSeed() {
  console.log('--- Starting A.D. GARMENTS Database Seed ---');

  await withTransaction(async (client) => {
    // 1. Factory
    let factoryRes = await client.query(
      `SELECT id FROM factories WHERE name = $1`,
      ['A.D. GARMENTS']
    );
    let factoryId: string;
    if (factoryRes.rows.length === 0) {
      const ins = await client.query(
        `INSERT INTO factories (name, timezone) VALUES ($1, $2) RETURNING id`,
        ['A.D. GARMENTS', 'Asia/Kolkata']
      );
      factoryId = ins.rows[0].id;
      console.log('Created Factory: A.D. GARMENTS (' + factoryId + ')');
    } else {
      factoryId = factoryRes.rows[0].id;
      console.log('Found Factory: A.D. GARMENTS (' + factoryId + ')');
    }

    // 2. Users
    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);
    const usersToSeed = [
      { email: 'admin@adgarments.com', name: 'Admin User', role: 'ADMIN' },
      { email: 'manager@adgarments.com', name: 'Production Manager', role: 'MANAGER' },
      { email: 'supervisor@adgarments.com', name: 'Floor Supervisor', role: 'SUPERVISOR' },
    ];

    const userMap: Record<string, string> = {};
    for (const u of usersToSeed) {
      const uRes = await client.query(`SELECT id FROM users WHERE email = $1`, [u.email]);
      if (uRes.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO users (factory_id, display_name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [factoryId, u.name, u.email, defaultPasswordHash, u.role]
        );
        userMap[u.role] = ins.rows[0].id;
        console.log(`Created user ${u.email} as ${u.role}`);
      } else {
        userMap[u.role] = uRes.rows[0].id;
        console.log(`Found user ${u.email} (${userMap[u.role]})`);
      }
    }

    // 3. Production Units
    const units = [
      { code: 'UNIT_1', name: 'UNIT-1', order: 1 },
      { code: 'UNIT_2', name: 'UNIT-2', order: 2 },
    ];
    const unitMap: Record<string, string> = {};
    for (const un of units) {
      const unRes = await client.query(
        `SELECT id FROM production_units WHERE factory_id = $1 AND stable_code = $2`,
        [factoryId, un.code]
      );
      if (unRes.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO production_units (factory_id, stable_code, display_name, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [factoryId, un.code, un.name, un.order]
        );
        unitMap[un.code] = ins.rows[0].id;
        console.log(`Created unit ${un.name}`);
      } else {
        unitMap[un.code] = unRes.rows[0].id;
      }
    }

    // 4. Departments
    const deptMap: Record<string, string> = {};
    const allConfigs = [
      ...UNIT_1_DEPARTMENTS.map((d) => ({ ...d, unitCode: 'UNIT_1' })),
      ...UNIT_2_DEPARTMENTS.map((d) => ({ ...d, unitCode: 'UNIT_2' })),
    ];

    for (const d of allConfigs) {
      const uId = unitMap[d.unitCode];
      const dRes = await client.query(
        `SELECT id FROM departments WHERE unit_id = $1 AND stable_code = $2`,
        [uId, d.code]
      );
      if (dRes.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO departments (unit_id, stable_code, visible_label, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [uId, d.code, d.label, d.order]
        );
        deptMap[d.code] = ins.rows[0].id;
        console.log(`Created department ${d.code} (${d.label})`);
      } else {
        deptMap[d.code] = dRes.rows[0].id;
      }
    }

    // 5. Historical Reference Reports (Oct 20 & Oct 21, 2026)
    const historicalReports = [
      {
        id: '20261020-0000-0000-0000-000000000001',
        date: '2026-10-20',
        unit1Entries: {
          U1_SINGER_1: 4,
          U1_FLATLOCK: 3,
          U1_OVERLOCK: 3,
          U1_HELPER: 2,
          U1_SINGER_2: 4,
          U1_CHECKING: 3,
          U1_IRONING: 3,
          U1_PACKING: 2,
        },
        unit2Entries: {
          U2_CUTTING: 6,
          U2_FLATLOCK: 6,
          U2_OVERLOCK: 6,
          U2_HELPER: 5,
          U2_SINGER_CO_SHIFT: 5,
          U2_CHECKING: 5,
          U2_IRONING: 5,
          U2_PACKING: 4,
        },
        staff: 2,
        shift: 7,
      },
      {
        id: '20261021-0000-0000-0000-000000000002',
        date: '2026-10-21',
        unit1Entries: {
          U1_SINGER_1: 4,
          U1_FLATLOCK: 3,
          U1_OVERLOCK: 4,
          U1_HELPER: 3,
          U1_SINGER_2: 3,
          U1_CHECKING: 3,
          U1_IRONING: 3,
          U1_PACKING: 2,
        },
        unit2Entries: {
          U2_CUTTING: 7,
          U2_FLATLOCK: 7,
          U2_OVERLOCK: 7,
          U2_HELPER: 6,
          U2_SINGER_CO_SHIFT: 6,
          U2_CHECKING: 6,
          U2_IRONING: 6,
          U2_PACKING: 5,
        },
        staff: 3,
        shift: 8,
      },
    ];

    for (const rep of historicalReports) {
      const exist = await client.query(
        `SELECT id FROM attendance_reports WHERE factory_id = $1 AND report_date = $2`,
        [factoryId, rep.date]
      );
      if (exist.rows.length === 0) {
        await client.query(
          `INSERT INTO attendance_reports (id, factory_id, report_date, status, revision, created_by, submitted_by, approved_by, submitted_at, approved_at)
           VALUES ($1, $2, $3, 'APPROVED', 1, $4, $4, $5, NOW(), NOW())`,
          [rep.id, factoryId, rep.date, userMap['SUPERVISOR'], userMap['MANAGER']]
        );

        // Adjustments
        await client.query(
          `INSERT INTO report_adjustments (report_id, staff_count, shift_count, is_staff_entered, is_shift_entered)
           VALUES ($1, $2, $3, true, true)`,
          [rep.id, rep.staff, rep.shift]
        );

        // Entries
        const combined = { ...rep.unit1Entries, ...rep.unit2Entries };
        for (const [code, count] of Object.entries(combined)) {
          const dId = deptMap[code];
          if (dId) {
            await client.query(
              `INSERT INTO attendance_entries (report_id, department_id, headcount, is_entered)
               VALUES ($1, $2, $3, true)`,
              [rep.id, dId, count]
            );
          }
        }
        console.log(`Created historical report for ${rep.date} (Status: APPROVED)`);
      }
    }
  });

  console.log('--- Database Seed Complete! ---');
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Seed failed:', err);
      pool.end();
      process.exit(1);
    });
}
