import { Platform } from 'react-native';
import { AttendanceReportRecord, ReportStatus, DepartmentConfig } from '@ad-garments/domain';

export interface LocalReportRow {
  id: string;
  factory_id: string;
  report_date: string;
  status: ReportStatus;
  revision: number;
  unit1_total: number;
  unit2_total: number;
  staff_count: number;
  shift_count: number;
  grand_total: number;
  entries_json: string;
  created_by: string;
  updated_at: string;
  sync_status: 'SYNCED' | 'PENDING' | 'CONFLICT' | 'ERROR';
}

export interface SyncQueueItem {
  operation_id: string;
  report_id: string;
  operation_type: 'CREATE' | 'UPDATE' | 'SUBMIT' | 'APPROVE' | 'REOPEN';
  base_revision: number;
  payload_json: string;
  status: 'PENDING' | 'IN_FLIGHT' | 'PROCESSED' | 'FAILED' | 'CONFLICT';
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

// Web fallback store with persistent localStorage support
const WEB_REPORTS_KEY = 'ad_garments_local_reports';
const WEB_QUEUE_KEY = 'ad_garments_sync_queue';
const WEB_DEPTS_KEY = 'ad_garments_departments';

function loadWebMap<T>(key: string): Map<string, T> {
  const map = new Map<string, T>();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          map.set(k, v as T);
        }
      }
    } catch (e) {
      // fallback to empty
    }
  }
  return map;
}

function saveWebMap<T>(key: string, map: Map<string, T>) {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const obj: Record<string, T> = {};
      map.forEach((v, k) => {
        obj[k] = v;
      });
      window.localStorage.setItem(key, JSON.stringify(obj));
    } catch (e) {
      // ignore storage overflow
    }
  }
}

const webStore = {
  reports: loadWebMap<LocalReportRow>(WEB_REPORTS_KEY),
  syncQueue: loadWebMap<SyncQueueItem>(WEB_QUEUE_KEY),
  config: new Map<string, string>(),
};

class DatabaseService {
  private db: any = null;
  private initialized = false;

  async init() {
    if (this.initialized) return;

    if (Platform.OS !== 'web') {
      try {
        const SQLite = await import('expo-sqlite');
        this.db = await SQLite.openDatabaseAsync('ad_attendance.db');
        
        await this.db.execAsync(`
          PRAGMA journal_mode = WAL;

          CREATE TABLE IF NOT EXISTS local_reports (
            id TEXT PRIMARY KEY,
            factory_id TEXT NOT NULL,
            report_date TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            unit1_total INTEGER NOT NULL DEFAULT 0,
            unit2_total INTEGER NOT NULL DEFAULT 0,
            staff_count INTEGER NOT NULL DEFAULT 0,
            shift_count INTEGER NOT NULL DEFAULT 0,
            grand_total INTEGER NOT NULL DEFAULT 0,
            entries_json TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_status TEXT NOT NULL DEFAULT 'PENDING'
          );

          CREATE TABLE IF NOT EXISTS sync_queue (
            operation_id TEXT PRIMARY KEY,
            report_id TEXT NOT NULL,
            operation_type TEXT NOT NULL,
            base_revision INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            retry_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS cached_config (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);
      } catch (err) {
        console.warn('[Database] Native SQLite initialization error, falling back to in-memory:', err);
        this.db = null;
      }
    }

    this.initialized = true;
  }

  // --- Local Reports ---
  async saveReportLocally(
    report: AttendanceReportRecord,
    syncStatus: 'SYNCED' | 'PENDING' | 'CONFLICT' | 'ERROR' = 'PENDING'
  ): Promise<void> {
    await this.init();
    const row: LocalReportRow = {
      id: report.id,
      factory_id: report.factoryId,
      report_date: report.reportDate,
      status: report.status,
      revision: report.revision,
      unit1_total: report.unit1Total,
      unit2_total: report.unit2Total,
      staff_count: report.staffCount,
      shift_count: report.shiftCount,
      grand_total: report.grandTotal,
      entries_json: JSON.stringify(report.entries),
      created_by: report.createdBy,
      updated_at: new Date().toISOString(),
      sync_status: syncStatus,
    };

    if (this.db) {
      await this.db.runAsync(
        `INSERT INTO local_reports (
          id, factory_id, report_date, status, revision,
          unit1_total, unit2_total, staff_count, shift_count, grand_total,
          entries_json, created_by, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          report_date = excluded.report_date,
          status = excluded.status,
          revision = excluded.revision,
          unit1_total = excluded.unit1_total,
          unit2_total = excluded.unit2_total,
          staff_count = excluded.staff_count,
          shift_count = excluded.shift_count,
          grand_total = excluded.grand_total,
          entries_json = excluded.entries_json,
          updated_at = excluded.updated_at,
          sync_status = excluded.sync_status`,
        [
          row.id,
          row.factory_id,
          row.report_date,
          row.status,
          row.revision,
          row.unit1_total,
          row.unit2_total,
          row.staff_count,
          row.shift_count,
          row.grand_total,
          row.entries_json,
          row.created_by,
          row.updated_at,
          row.sync_status,
        ]
      );
    } else {
      webStore.reports.set(row.id, row);
      saveWebMap(WEB_REPORTS_KEY, webStore.reports);
    }
  }

  async getLocalReportById(id: string): Promise<AttendanceReportRecord | null> {
    await this.init();
    if (this.db) {
      const row = await this.db.getFirstAsync('SELECT * FROM local_reports WHERE id = ?', [id]);
      return row ? this.mapRowToRecord(row as LocalReportRow) : null;
    } else {
      const row = webStore.reports.get(id);
      return row ? this.mapRowToRecord(row) : null;
    }
  }

  async getLocalReportByDate(date: string): Promise<AttendanceReportRecord | null> {
    await this.init();
    if (this.db) {
      const row = await this.db.getFirstAsync('SELECT * FROM local_reports WHERE report_date = ?', [date]);
      return row ? this.mapRowToRecord(row as LocalReportRow) : null;
    } else {
      for (const row of webStore.reports.values()) {
        if (row.report_date === date) return this.mapRowToRecord(row);
      }
      return null;
    }
  }

  async getAllLocalReports(): Promise<AttendanceReportRecord[]> {
    await this.init();
    if (this.db) {
      const rows = await this.db.getAllAsync('SELECT * FROM local_reports ORDER BY report_date DESC');
      return (rows as LocalReportRow[]).map((r) => this.mapRowToRecord(r));
    } else {
      return Array.from(webStore.reports.values())
        .sort((a, b) => b.report_date.localeCompare(a.report_date))
        .map((r) => this.mapRowToRecord(r));
    }
  }

  // --- Sync Queue ---
  async enqueueSyncOperation(item: Omit<SyncQueueItem, 'status' | 'retry_count' | 'error_message'>): Promise<void> {
    await this.init();
    const queueItem: SyncQueueItem = {
      ...item,
      status: 'PENDING',
      retry_count: 0,
      error_message: null,
    };

    if (this.db) {
      await this.db.runAsync(
        `INSERT INTO sync_queue (
          operation_id, report_id, operation_type, base_revision, payload_json, status, retry_count, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queueItem.operation_id,
          queueItem.report_id,
          queueItem.operation_type,
          queueItem.base_revision,
          queueItem.payload_json,
          queueItem.status,
          queueItem.retry_count,
          queueItem.error_message,
          queueItem.created_at,
        ]
      );
    } else {
      webStore.syncQueue.set(queueItem.operation_id, queueItem);
      saveWebMap(WEB_QUEUE_KEY, webStore.syncQueue);
    }
  }

  async getPendingSyncOperations(): Promise<SyncQueueItem[]> {
    await this.init();
    if (this.db) {
      const rows = await this.db.getAllAsync(
        `SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED') ORDER BY created_at ASC`
      );
      return rows as SyncQueueItem[];
    } else {
      return Array.from(webStore.syncQueue.values())
        .filter((i) => i.status === 'PENDING' || i.status === 'FAILED')
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
  }

  async updateSyncOperationStatus(
    operationId: string,
    status: SyncQueueItem['status'],
    errorMessage?: string
  ): Promise<void> {
    await this.init();
    if (this.db) {
      await this.db.runAsync(
        `UPDATE sync_queue SET status = ?, retry_count = retry_count + 1, error_message = ? WHERE operation_id = ?`,
        [status, errorMessage || null, operationId]
      );
    } else {
      const item = webStore.syncQueue.get(operationId);
      if (item) {
        item.status = status;
        item.retry_count += 1;
        item.error_message = errorMessage || null;
        saveWebMap(WEB_QUEUE_KEY, webStore.syncQueue);
      }
    }
  }

  async getPendingSyncCount(): Promise<number> {
    await this.init();
    if (this.db) {
      const res = await this.db.getFirstAsync(
        `SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('PENDING', 'FAILED')`
      );
      return res ? (res as any).count : 0;
    } else {
      return Array.from(webStore.syncQueue.values()).filter(
        (i) => i.status === 'PENDING' || i.status === 'FAILED'
      ).length;
    }
  }

  async getCachedDepartments(): Promise<{ unit1: DepartmentConfig[]; unit2: DepartmentConfig[] } | null> {
    await this.init();
    if (this.db) {
      const row = await this.db.getFirstAsync('SELECT value_json FROM cached_config WHERE key = ?', ['departments']);
      if (row && (row as any).value_json) {
        try {
          return JSON.parse((row as any).value_json);
        } catch {
          return null;
        }
      }
      return null;
    } else {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem(WEB_DEPTS_KEY);
          if (raw) return JSON.parse(raw);
        } catch {}
      }
      return null;
    }
  }

  async saveCachedDepartments(unit1: DepartmentConfig[], unit2: DepartmentConfig[]): Promise<void> {
    await this.init();
    const data = { unit1, unit2 };
    const json = JSON.stringify(data);
    if (this.db) {
      await this.db.runAsync(
        `INSERT INTO cached_config (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        ['departments', json, new Date().toISOString()]
      );
    } else {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(WEB_DEPTS_KEY, json);
        } catch {}
      }
    }
  }

  private mapRowToRecord(row: LocalReportRow): AttendanceReportRecord {
    let entries: Record<string, number> = {};
    try {
      entries = JSON.parse(row.entries_json);
    } catch {
      entries = {};
    }

    return {
      id: row.id,
      factoryId: row.factory_id,
      reportDate: row.report_date,
      status: row.status,
      revision: row.revision,
      unit1Total: row.unit1_total,
      unit2Total: row.unit2_total,
      staffCount: row.staff_count,
      shiftCount: row.shift_count,
      grandTotal: row.grand_total,
      entries,
      createdBy: row.created_by,
      createdAt: row.updated_at,
      updatedAt: row.updated_at,
    };
  }
}

export const dbService = new DatabaseService();
