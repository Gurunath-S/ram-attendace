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
  const [isServerReachable, setIsServerReachable] = useState<boolean | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    // 1. Instant local load (0ms latency)
    const local = await dbService.getLocalReportByDate(todayStr);
    if (local) {
      setTodayReport(local);
    }

    // 2. Refresh from server in background if online
    try {
      const serverReports = await ApiClient.getReports({ date: todayStr });
      setIsServerReachable(true);
      if (serverReports && serverReports.length > 0) {
        setTodayReport(serverReports[0]);
        await dbService.saveReportLocally(serverReports[0], 'SYNCED');
      }
    } catch {
      setIsServerReachable(false);
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

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'APPROVED':
        return { text: colors.approved, bg: colors.approvedBg, border: colors.approvedBorder, label: 'APPROVED' };
      case 'SUBMITTED':
        return { text: colors.submitted, bg: colors.submittedBg, border: colors.submittedBorder, label: 'SUBMITTED' };
      case 'DRAFT':
        return { text: colors.draft, bg: colors.draftBg, border: colors.draftBorder, label: 'IN PROGRESS DRAFT' };
      case 'REOPENED':
        return { text: colors.reopened, bg: colors.reopenedBg, border: colors.reopenedBorder, label: 'REOPENED' };
      default:
        return { text: colors.textSecondary, bg: '#F1F5F9', border: '#E2E8F0', label: 'NO RECORD TODAY' };
    }
  };

  const statusStyle = getStatusBadge(todayReport?.status);

  // Workforce percentages for comparative bar
  const u1Count = todayReport?.unit1Total ?? 0;
  const u2Count = todayReport?.unit2Total ?? 0;
  const totalFloor = u1Count + u2Count;
  const u1Ratio = totalFloor > 0 ? (u1Count / totalFloor) * 100 : 50;
  const u2Ratio = totalFloor > 0 ? (u2Count / totalFloor) * 100 : 50;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primaryAccent}
          colors={[colors.primaryAccent]}
        />
      }
    >
      {/* Top Context & Engine Status Strip */}
      <View style={styles.engineBar}>
        <View style={styles.engineLeft}>
          <View
            style={[
              styles.pulseDot,
              { backgroundColor: isServerReachable === false ? colors.pendingSync : colors.synced },
            ]}
          />
          <Text style={styles.engineStatusText}>
            {isServerReachable === false
              ? 'Local Offline Engine &bull; Zero Delay'
              : syncState.pendingCount > 0
              ? `${syncState.pendingCount} Local Ops In Queue`
              : 'Enterprise Cloud Synchronized'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.syncPillBtn, syncState.isSyncing && styles.btnDisabled]}
          onPress={onRefresh}
          disabled={syncState.isSyncing}
          activeOpacity={0.7}
        >
          {syncState.isSyncing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="sync" size={13} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.syncPillText}>Sync</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Hero Grand Total Obsidian Card */}
      <View style={styles.heroCard}>
        {/* Header row in Hero */}
        <View style={styles.heroHeaderRow}>
          <View>
            <Text style={styles.heroOverline}>TODAY'S FACTORY ATTENDANCE</Text>
            <Text style={styles.heroDate}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
            ]}
          >
            <Text style={[styles.statusPillText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        {/* Display Numeric Grand Total */}
        <View style={styles.heroCountRow}>
          <View>
            <Text style={styles.grandNumber}>{todayReport?.grandTotal ?? 0}</Text>
            <Text style={styles.grandLabel}>TOTAL WORKERS PRESENT</Text>
          </View>
          <View style={styles.heroShieldIcon}>
            <Ionicons name="people" size={32} color="rgba(255, 255, 255, 0.2)" />
          </View>
        </View>

        {/* Breakdown Formula Pill */}
        <View style={styles.formulaStrip}>
          <Text style={styles.formulaText}>
            U1: <Text style={styles.formulaNum}>{u1Count}</Text> &bull; U2:{' '}
            <Text style={styles.formulaNum}>{u2Count}</Text> &bull; Staff:{' '}
            <Text style={styles.formulaNum}>{todayReport?.staffCount ?? 0}</Text> &bull; Shift:{' '}
            <Text style={styles.formulaNum}>{todayReport?.shiftCount ?? 0}</Text>
          </Text>
        </View>

        {/* Workforce Split Distribution Bar */}
        <View style={styles.ratioContainer}>
          <View style={styles.ratioLabels}>
            <Text style={[styles.ratioTitle, { color: '#7DD3FC' }]}>
              Unit 1: {u1Count} ({Math.round(u1Ratio)}%)
            </Text>
            <Text style={[styles.ratioTitle, { color: '#A5B4FC' }]}>
              Unit 2: {u2Count} ({Math.round(u2Ratio)}%)
            </Text>
          </View>
          <View style={styles.ratioTrack}>
            <View style={[styles.ratioBarU1, { width: `${u1Ratio}%` }]} />
            <View style={[styles.ratioBarU2, { width: `${u2Ratio}%` }]} />
          </View>
        </View>
      </View>

      {/* Production Unit Summary Cards */}
      <View style={styles.unitsGrid}>
        {/* Unit 1 Card */}
        <TouchableOpacity
          style={styles.unitCard}
          onPress={() => router.push('/(tabs)/entry')}
          activeOpacity={0.8}
        >
          <View style={styles.unitCardTop}>
            <View style={[styles.unitBadge, { backgroundColor: colors.unit1Bg }]}>
              <Text style={[styles.unitBadgeText, { color: colors.unit1 }]}>UNIT-1</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
          <Text style={[styles.unitCardValue, { color: colors.unit1 }]}>{u1Count}</Text>
          <Text style={styles.unitCardSub}>8 Production Departments</Text>
          <View style={styles.unitFooterChip}>
            <Text style={styles.unitFooterChipText}>
              Staff: +{todayReport?.staffCount ?? 0}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Unit 2 Card */}
        <TouchableOpacity
          style={styles.unitCard}
          onPress={() => router.push('/(tabs)/entry')}
          activeOpacity={0.8}
        >
          <View style={styles.unitCardTop}>
            <View style={[styles.unitBadge, { backgroundColor: colors.unit2Bg }]}>
              <Text style={[styles.unitBadgeText, { color: colors.unit2 }]}>UNIT-2</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
          <Text style={[styles.unitCardValue, { color: colors.unit2 }]}>{u2Count}</Text>
          <Text style={styles.unitCardSub}>8 Production Departments</Text>
          <View style={[styles.unitFooterChip, { backgroundColor: '#F5F3FF' }]}>
            <Text style={[styles.unitFooterChipText, { color: colors.shift }]}>
              Shift: +{todayReport?.shiftCount ?? 0}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Quick Launchpad Hub */}
      <Text style={styles.sectionTitle}>WORKFLOW ACTIONS</Text>
      <View style={styles.actionHubGrid}>
        <TouchableOpacity
          style={styles.actionHubCard}
          onPress={() => router.push('/(tabs)/entry')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconPill, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="create" size={22} color={colors.primaryAccent} />
          </View>
          <Text style={styles.actionCardTitle}>Daily Entry</Text>
          <Text style={styles.actionCardDesc}>
            Record & calculate 16 departments + Staff/Shift
          </Text>
          <View style={styles.actionArrow}>
            <Ionicons name="arrow-forward" size={14} color={colors.primaryAccent} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionHubCard}
          onPress={() => router.push('/(tabs)/reports')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconPill, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="bar-chart" size={22} color={colors.approved} />
          </View>
          <Text style={styles.actionCardTitle}>Periodic Reports</Text>
          <Text style={styles.actionCardDesc}>
            Weekly & monthly analytics with PDF export
          </Text>
          <View style={styles.actionArrow}>
            <Ionicons name="arrow-forward" size={14} color={colors.approved} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionHubCard}
          onPress={() => router.push('/(tabs)/history')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconPill, { backgroundColor: '#FDF4FF' }]}>
            <Ionicons name="time" size={22} color="#A855F7" />
          </View>
          <Text style={styles.actionCardTitle}>Report History</Text>
          <Text style={styles.actionCardDesc}>
            Audit trails, revisions & past date queries
          </Text>
          <View style={styles.actionArrow}>
            <Ionicons name="arrow-forward" size={14} color="#A855F7" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionHubCard}
          onPress={() => router.push('/(tabs)/settings')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconPill, { backgroundColor: '#FFFBEB' }]}>
            <Ionicons name="hardware-chip" size={22} color={colors.draft} />
          </View>
          <Text style={styles.actionCardTitle}>Sync Engine</Text>
          <Text style={styles.actionCardDesc}>
            Inspect offline queue & server diagnostics
          </Text>
          <View style={styles.actionArrow}>
            <Ionicons name="arrow-forward" size={14} color={colors.draft} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Active User Session Pill */}
      <View style={styles.userProfileCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.avatarInitials}>
            {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'AG'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.profileName}>{user?.displayName || 'User'}</Text>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>{user?.role || 'SUPERVISOR'}</Text>
            </View>
          </View>
          <Text style={styles.profileEmail}>{user?.email || 'A.D. GARMENTS Manufacturing'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  engineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  engineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  engineStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  syncPillBtn: {
    backgroundColor: colors.primaryNavy,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroOverline: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  heroDate: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  grandNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: -1,
  },
  grandLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  heroShieldIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formulaStrip: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  formulaText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  formulaNum: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  ratioContainer: {
    marginTop: 2,
  },
  ratioLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ratioTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  ratioTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  ratioBarU1: {
    height: '100%',
    backgroundColor: '#0284C7',
  },
  ratioBarU2: {
    height: '100%',
    backgroundColor: '#6366F1',
  },
  unitsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  unitCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  unitCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  unitCardValue: {
    fontSize: 28,
    fontWeight: '900',
    marginVertical: 4,
  },
  unitCardSub: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  unitFooterChip: {
    marginTop: 10,
    backgroundColor: '#F0F9FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  unitFooterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.unit1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  actionHubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  actionHubCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    position: 'relative',
  },
  actionIconPill: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  actionCardDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  actionArrow: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  userProfileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  profileName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  roleTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primaryAccent,
  },
  profileEmail: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
