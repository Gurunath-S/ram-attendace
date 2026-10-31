import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { syncEngine } from '../../services/syncEngine';
import { dbService } from '../../services/db';
import { ApiClient } from '../../services/api';
import { AttendanceReportRecord } from '@ad-garments/domain';
import { colors } from '../../theme/colors';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [todayReport, setTodayReport] = useState<AttendanceReportRecord | null>(null);
  const [syncState, setSyncState] = useState({
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null as string | null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    // 1. Try to load today's report from local DB first
    const local = await dbService.getLocalReportByDate(todayStr);
    if (local) {
      setTodayReport(local);
    }

    // 2. Refresh from server if online
    try {
      const serverReports = await ApiClient.getReports({ date: todayStr });
      if (serverReports && serverReports.length > 0) {
        setTodayReport(serverReports[0]);
        await dbService.saveReportLocally(serverReports[0], 'SYNCED');
      }
    } catch (e) {
      // Offline fallback: keep local copy
    }
  }, [todayStr]);

  useEffect(() => {
    loadData();
    const unsub = syncEngine.subscribe(setSyncState);
    return () => {
      unsub();
    };
  }, [loadData]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await syncEngine.triggerSync();
    await loadData();
    setIsRefreshing(false);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'APPROVED':
        return { text: colors.approved, bg: colors.approvedBg };
      case 'SUBMITTED':
        return { text: colors.submitted, bg: colors.submittedBg };
      case 'DRAFT':
        return { text: colors.draft, bg: colors.draftBg };
      default:
        return { text: colors.textSecondary, bg: colors.surfaceSubtle };
    }
  };

  const statusStyle = getStatusColor(todayReport?.status);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[colors.primaryAccent]} />
      }
    >
      {/* Top Banner */}
      <View style={styles.topCard}>
        <View style={styles.topCardRow}>
          <View>
            <Text style={styles.dateLabel}>TODAY'S PRODUCTION</Text>
            <Text style={styles.dateValue}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {todayReport ? todayReport.status : 'NOT STARTED'}
            </Text>
          </View>
        </View>

        {/* Sync Status Banner */}
        <View style={styles.syncRow}>
          <View style={styles.syncInfo}>
            <Ionicons
              name={syncState.pendingCount > 0 ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
              size={16}
              color={syncState.pendingCount > 0 ? colors.pendingSync : colors.synced}
            />
            <Text style={styles.syncText}>
              {syncState.pendingCount > 0
                ? `${syncState.pendingCount} local updates pending sync`
                : 'All local changes synchronized'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={() => syncEngine.triggerSync()}
            disabled={syncState.isSyncing}
          >
            {syncState.isSyncing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.syncBtnText}>Sync Now</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Primary KPI Cards */}
      <Text style={styles.sectionHeader}>HEADCOUNT SUMMARY</Text>
      <View style={styles.kpiGrid}>
        {/* Unit 1 */}
        <View style={[styles.kpiCard, { borderLeftColor: colors.unit1 }]}>
          <Text style={styles.kpiTitle}>UNIT 1</Text>
          <Text style={[styles.kpiValue, { color: colors.unit1 }]}>
            {todayReport?.unit1Total ?? 0}
          </Text>
          <Text style={styles.kpiSub}>Staff: {todayReport?.staffCount ?? 0}</Text>
        </View>

        {/* Unit 2 */}
        <View style={[styles.kpiCard, { borderLeftColor: colors.unit2 }]}>
          <Text style={styles.kpiTitle}>UNIT 2</Text>
          <Text style={[styles.kpiValue, { color: colors.unit2 }]}>
            {todayReport?.unit2Total ?? 0}
          </Text>
          <Text style={styles.kpiSub}>Shift: {todayReport?.shiftCount ?? 0}</Text>
        </View>
      </View>

      {/* Grand Total Hero Card */}
      <View style={styles.grandCard}>
        <View>
          <Text style={styles.grandTitle}>GRAND TOTAL</Text>
          <Text style={styles.grandFormula}>Unit 1 + Unit 2 + Staff + Shift</Text>
        </View>
        <Text style={styles.grandValue}>{todayReport?.grandTotal ?? 0}</Text>
      </View>

      {/* Quick Action Buttons */}
      <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>
      <View style={styles.actionGrid}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/(tabs)/entry')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="clipboard-outline" size={24} color={colors.primaryAccent} />
          </View>
          <Text style={styles.actionBtnTitle}>Enter Attendance</Text>
          <Text style={styles.actionBtnDesc}>Record Unit 1 & 2 counts</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/(tabs)/reports')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="document-text-outline" size={24} color={colors.approved} />
          </View>
          <Text style={styles.actionBtnTitle}>Weekly Reports</Text>
          <Text style={styles.actionBtnDesc}>View aggregates & PDF export</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/(tabs)/history')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#FAF5FF' }]}>
            <Ionicons name="time-outline" size={24} color={colors.reopened} />
          </View>
          <Text style={styles.actionBtnTitle}>Report History</Text>
          <Text style={styles.actionBtnDesc}>Search past dates & audits</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#F8FAFC' }]}>
            <Ionicons name="sync-outline" size={24} color={colors.secondary} />
          </View>
          <Text style={styles.actionBtnTitle}>Sync Engine</Text>
          <Text style={styles.actionBtnDesc}>Review queue & conflicts</Text>
        </TouchableOpacity>
      </View>

      {/* User Session Bar */}
      <View style={styles.userBar}>
        <View style={styles.userAvatar}>
          <Text style={styles.avatarText}>{user?.displayName?.charAt(0) || 'U'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.displayName || 'User'}</Text>
          <Text style={styles.userRole}>
            Role: {user?.role} &bull; Factory: A.D. GARMENTS
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  topCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  topCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  dateValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  syncText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  syncBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 6,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  grandCard: {
    backgroundColor: colors.primary,
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  grandTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  grandFormula: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 2,
  },
  grandValue: {
    fontSize: 38,
    fontWeight: '900',
    color: '#38BDF8',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionBtn: {
    width: '48%',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  actionBtnDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  userBar: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  userRole: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
