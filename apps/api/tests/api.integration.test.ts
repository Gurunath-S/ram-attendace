import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db/index.js';

describe('A.D. GARMENTS API Integration Tests', () => {
  let supervisorToken: string;
  let managerToken: string;
  let adminToken: string;
  let factoryId: string;

  beforeAll(async () => {
    // Authenticate supervisor
    const supLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'supervisor@adgarments.com', password: 'Password@123' });
    expect(supLogin.status).toBe(200);
    supervisorToken = supLogin.body.token;
    factoryId = supLogin.body.user.factoryId;

    // Authenticate manager
    const mgrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager@adgarments.com', password: 'Password@123' });
    expect(mgrLogin.status).toBe(200);
    managerToken = mgrLogin.body.token;

    // Authenticate admin
    const admLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@adgarments.com', password: 'Password@123' });
    expect(admLogin.status).toBe(200);
    adminToken = admLogin.body.token;

    // Clean up test reports from previous runs
    const testIds = ['77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999'];
    await pool.query('DELETE FROM sync_operations WHERE report_id = ANY($1::uuid[]) OR operation_id = $2', [testIds, '88888888-8888-8888-8888-888888888888']);
    await pool.query('DELETE FROM audit_events WHERE report_id = ANY($1::uuid[])', [testIds]);
    await pool.query('DELETE FROM attendance_entries WHERE report_id = ANY($1::uuid[])', [testIds]);
    await pool.query('DELETE FROM report_adjustments WHERE report_id = ANY($1::uuid[])', [testIds]);
    await pool.query('DELETE FROM attendance_reports WHERE id = ANY($1::uuid[])', [testIds]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /health returns OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('GET /api/v1/auth/me returns current user info', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('supervisor@adgarments.com');
    expect(res.body.role).toBe('SUPERVISOR');
  });

  it('GET /api/v1/config returns factory and all 16 departments with stable codes', async () => {
    const res = await request(app)
      .get('/api/v1/config')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.factory.name).toBe('A.D. GARMENTS');
    expect(res.body.departments).toHaveLength(16);

    const codes = res.body.departments.map((d: any) => d.code);
    expect(codes).toContain('U1_SINGER_1');
    expect(codes).toContain('U1_SINGER_2');
    expect(codes).toContain('U2_SINGER_CO_SHIFT');
  });

  it('Enforces RBAC: Supervisor cannot access /users (Admin only)', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(Array.isArray(adminRes.body)).toBe(true);
  });

  it('Acceptance Test 1: Oct 20, 2026 report reproduces exact totals (Unit1: 24, Unit2: 42, STAFF: 2, SHIFT: 7, Grand Total: 75)', async () => {
    const res = await request(app)
      .get('/api/v1/attendance?date=2026-10-20')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.reportDate).toBe('2026-10-20');
    expect(res.body.unit1Total).toBe(24);
    expect(res.body.unit2Total).toBe(42);
    expect(res.body.staffCount).toBe(2);
    expect(res.body.shiftCount).toBe(7);
    expect(res.body.grandTotal).toBe(75);
    expect(res.body.status).toBe('APPROVED');
  });

  it('Acceptance Test 2: Oct 21, 2026 report reproduces exact totals (Unit1: 25, Unit2: 50, STAFF: 3, SHIFT: 8, Grand Total: 86)', async () => {
    const res = await request(app)
      .get('/api/v1/attendance?date=2026-10-21')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.reportDate).toBe('2026-10-21');
    expect(res.body.unit1Total).toBe(25);
    expect(res.body.unit2Total).toBe(50);
    expect(res.body.staffCount).toBe(3);
    expect(res.body.shiftCount).toBe(8);
    expect(res.body.grandTotal).toBe(86);
    expect(res.body.status).toBe('APPROVED');
  });

  it('Supports offline-generated UUID draft creation and live automatic calculations', async () => {
    const testReportId = '77777777-7777-7777-7777-777777777777';
    const draftPayload = {
      id: testReportId,
      factoryId,
      reportDate: '2026-10-25',
      entries: {
        U1_SINGER_1: 5,
        U1_FLATLOCK: 3,
      },
      staffCount: 2,
      shiftCount: null,
    };

    const res = await request(app)
      .post('/api/v1/attendance')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send(draftPayload);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testReportId);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.unit1Total).toBe(8);
    expect(res.body.grandTotal).toBe(10); // 8 + 0 + 2 + 0
    expect(res.body.revision).toBe(1);
  });

  it('Rejects submission of incomplete report with missing departments', async () => {
    const testReportId = '77777777-7777-7777-7777-777777777777';
    const res = await request(app)
      .post(`/api/v1/attendance/${testReportId}/submit`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ revision: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('Detects optimistic concurrency conflict when revision does not match', async () => {
    const testReportId = '77777777-7777-7777-7777-777777777777';
    const staleUpdate = {
      id: testReportId,
      factoryId,
      reportDate: '2026-10-25',
      revision: 99, // Stale revision
      entries: { U1_SINGER_1: 6 },
      staffCount: 2,
      shiftCount: 0,
    };

    const res = await request(app)
      .post('/api/v1/attendance')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send(staleUpdate);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Conflict');
  });

  it('Processes idempotent synchronization push correctly', async () => {
    const syncOpId = '88888888-8888-8888-8888-888888888888';
    const reportId = '99999999-9999-9999-9999-999999999999';

    const syncPayload = {
      operations: [
        {
          operationId: syncOpId,
          reportId,
          userId: '00000000-0000-0000-0000-000000000000',
          operationType: 'CREATE',
          baseRevision: 0,
          payload: {
            id: reportId,
            factoryId,
            reportDate: '2026-10-26',
            entries: { U1_SINGER_1: 10 },
            staffCount: 1,
            shiftCount: 1,
          },
          createdAt: new Date().toISOString(),
          status: 'PENDING',
        },
      ],
    };

    // First push
    const res1 = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send(syncPayload);

    expect(res1.status).toBe(200);
    expect(res1.body.results[0].status).toBe('PROCESSED');

    // Duplicate push (idempotent retry)
    const res2 = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send(syncPayload);

    expect(res2.status).toBe(200);
    expect(res2.body.results[0].status).toBe('IDEMPOTENT_HIT');
  });

  it('Generates downloadable text-based PDF report', async () => {
    const oct20Id = '20261020-0000-0000-0000-000000000001';
    const res = await request(app)
      .get(`/api/v1/reports/${oct20Id}/pdf`)
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length).toBeGreaterThan(500); // Valid PDF binary bytes
  });

  it('Generates Excel (.xlsx) report', async () => {
    const oct20Id = '20261020-0000-0000-0000-000000000001';
    const res = await request(app)
      .get(`/api/v1/reports/${oct20Id}/excel`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('Computes weekly aggregates correctly', async () => {
    const res = await request(app)
      .get('/api/v1/reports/weekly?weekStart=2026-10-19')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalDaysRecorded).toBeGreaterThanOrEqual(2);
    expect(res.body.days).toHaveLength(7);
  });
});
