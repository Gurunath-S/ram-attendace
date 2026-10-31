import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ApiClient } from '../../services/api';
import { dbService } from '../../services/db';
import { AttendanceReportRecord } from '@ad-garments/domain';
import { colors } from '../../theme/colors';

export default function HistoryScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<AttendanceReportRecord[]>([]);
  const [filteredReports, setFilteredReports] = useState<AttendanceReportRecord[]>([]);
  const [searchDate, setSearchDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'SUBMITTED' | 'DRAFT'>('ALL');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch from server
      const list = await ApiClient.getReports();
      setReports(list);
      // Cache all to local SQLite
      for (const rep of list) {
        await dbService.saveReportLocally(rep, 'SYNCED');
      }
    } catch {
      // 2. Fallback to local SQLite cache
      const local = await dbService.getAllLocalReports();
      setReports(local);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  useEffect(() => {
    let list = reports;
    if (searchDate.trim()) {
      list = list.filter((r) => r.reportDate.includes(searchDate.trim()));
    }
    if (statusFilter !== 'ALL') {
      list = list.filter((r) => r.status === statusFilter);
    }
    setFilteredReports(list);
  }, [reports, searchDate, statusFilter]);

  const getStatusBadge = (status: string) => {
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

  const renderReportItem = ({ item }: { item: AttendanceReportRecord }) => {
    const badge = getStatusBadge(item.status);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/report/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.reportDate}>{item.reportDate}</Text>
            <Text style={styles.revisionText}>Revision {item.revision}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>UNIT 1</Text>
            <Text style={styles.statNum}>{item.unit1Total}</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>UNIT 2</Text>
            <Text style={styles.statNum}>{item.unit2Total}</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>STAFF / SHIFT</Text>
            <Text style={styles.statNum}>{item.staffCount} / {item.shiftCount}</Text>
          </View>
          <View style={[styles.statCol, styles.grandCol]}>
            <Text style={[styles.statLabel, { color: colors.primaryAccent }]}>GRAND TOTAL</Text>
            <Text style={[styles.statNum, { color: colors.primaryAccent, fontWeight: '900' }]}>
              {item.grandTotal}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.footerInfo}>Tap to view details, audit trail & generate PDF</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search & Filter Bar */}
      <View style={styles.filterBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search date (YYYY-MM-DD)..."
            value={searchDate}
            onChangeText={setSearchDate}
          />
          {searchDate.length > 0 && (
            <TouchableOpacity onPress={() => setSearchDate('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        <View style={styles.pillsRow}>
          {(['ALL', 'APPROVED', 'SUBMITTED', 'DRAFT'] as const).map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.pill, statusFilter === st && styles.pillActive]}
              onPress={() => setStatusFilter(st)}
            >
              <Text style={[styles.pillText, statusFilter === st && styles.pillTextActive]}>
                {st}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Reports List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryAccent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={renderReportItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primaryAccent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No Reports Found</Text>
              <Text style={styles.emptyDesc}>No reports match the current filter or date query.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterBar: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportDate: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  revisionText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardStats: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  grandCol: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  statNum: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerInfo: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
