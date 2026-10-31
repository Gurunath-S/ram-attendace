import { dbService, SyncQueueItem } from './db';
import { ApiClient } from './api';
import { AppStorage } from './storage';
import { AttendanceReportRecord, AttendanceReportInput } from '@ad-garments/domain';

type SyncListener = (state: { isSyncing: boolean; pendingCount: number; lastSyncedAt: string | null }) => void;

class SyncEngine {
  private isSyncing = false;
  private listeners: Set<SyncListener> = new Set();
  private lastSyncedAt: string | null = null;

  async init() {
    this.lastSyncedAt = await AppStorage.getItem('last_synced_at');
  }

  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  private async notify() {
    const pendingCount = await dbService.getPendingSyncCount();
    for (const listener of this.listeners) {
      listener({
        isSyncing: this.isSyncing,
        pendingCount,
        lastSyncedAt: this.lastSyncedAt,
      });
    }
  }

  // Generate UUID v4 for offline creation
  generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Save draft locally & enqueue sync
  async saveDraft(
    report: AttendanceReportInput,
    user: { id: string; factoryId: string },
    isNew: boolean
  ): Promise<AttendanceReportRecord> {
    const reportRecord: AttendanceReportRecord = {
      id: report.id,
      factoryId: user.factoryId,
      reportDate: report.reportDate,
      status: report.status || 'DRAFT',
      revision: report.revision || 1,
      unit1Total: 0,
      unit2Total: 0,
      staffCount: report.staffCount ?? 0,
      shiftCount: report.shiftCount ?? 0,
      grandTotal: 0,
      entries: (report.entries as Record<string, number>) || {},
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Calculate totals locally
    const { calculateAttendanceTotals } = await import('@ad-garments/domain');
    const totals = calculateAttendanceTotals(
      reportRecord.entries,
      reportRecord.staffCount,
      reportRecord.shiftCount
    );
    reportRecord.unit1Total = totals.unit1Total;
    reportRecord.unit2Total = totals.unit2Total;
    reportRecord.grandTotal = totals.grandTotal;

    // 1. Save to local SQLite immediately
    await dbService.saveReportLocally(reportRecord, 'PENDING');

    // 2. Enqueue sync operation
    const opId = this.generateUUID();
    await dbService.enqueueSyncOperation({
      operation_id: opId,
      report_id: report.id,
      operation_type: isNew ? 'CREATE' : 'UPDATE',
      base_revision: isNew ? 0 : report.revision || 1,
      payload_json: JSON.stringify(report),
      created_at: new Date().toISOString(),
    });

    this.notify();

    // 3. Trigger background sync attempt
    this.triggerSync().catch((err) => {
      console.log('[SyncEngine] Offline/Background sync deferred:', err.message);
    });

    return reportRecord;
  }

  // Trigger sync push & pull
  async triggerSync(): Promise<{ success: boolean; error?: string }> {
    if (this.isSyncing) return { success: true };

    this.isSyncing = true;
    this.notify();

    try {
      // 1. Process pending outgoing queue
      const pendingOps = await dbService.getPendingSyncOperations();
      if (pendingOps.length > 0) {
        const payload = pendingOps.map((op) => ({
          operationId: op.operation_id,
          reportId: op.report_id,
          operationType: op.operation_type,
          baseRevision: op.base_revision,
          payload: JSON.parse(op.payload_json),
          createdAt: op.created_at,
        }));

        const pushRes = await ApiClient.syncPush(payload);

        for (const res of pushRes.results || []) {
          if (res.status === 'PROCESSED' || res.status === 'IDEMPOTENT_HIT') {
            await dbService.updateSyncOperationStatus(res.operationId, 'PROCESSED');
            if (res.report) {
              await dbService.saveReportLocally(res.report, 'SYNCED');
            }
          } else if (res.status === 'CONFLICT') {
            await dbService.updateSyncOperationStatus(res.operationId, 'CONFLICT', res.errorMessage);
            if (res.report) {
              await dbService.saveReportLocally(res.report, 'CONFLICT');
            }
          } else {
            await dbService.updateSyncOperationStatus(res.operationId, 'FAILED', res.errorMessage);
          }
        }
      }

      // 2. Pull server changes
      const since = this.lastSyncedAt || new Date(0).toISOString();
      const pullRes = await ApiClient.syncPull(since);

      if (pullRes.reports && Array.isArray(pullRes.reports)) {
        for (const rep of pullRes.reports) {
          await dbService.saveReportLocally(rep, 'SYNCED');
        }
      }

      this.lastSyncedAt = pullRes.syncedAt || new Date().toISOString();
      await AppStorage.setItem('last_synced_at', this.lastSyncedAt!);

      return { success: true };
    } catch (err: any) {
      console.warn('[SyncEngine] Sync failed:', err.message);
      return { success: false, error: err.message };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }
}

export const syncEngine = new SyncEngine();
