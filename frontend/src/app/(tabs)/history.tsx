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
      // 1. Fetch from server if reachable
      const list = await ApiClient.getReports();
      setReports(list);
      // Cache to local SQLite/Storage
      for (const rep of list) {
        await dbService.saveReportLocally(rep, 'SYNCED');
      }
    } catch {
      // 2. Instant fallback to local store
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
        return { text: colors.approved, bg: colors.approvedBg, border: colors.approvedBorder };
      case 'SUBMITTED':
        return { text: colors.submitted, bg: colors.submittedBg, border: colors.submittedBorder };
      case 'DRAFT':
        return { text: colors.draft, bg: colors.draftBg, border: colors.draftBorder };
      case 'REOPENED':
        return { text: colors.reopened, bg: colors.reopenedBg, border: colors.reopenedBorder };
      default:
        return { text: colors.textSecondary, bg: '#F1F5F9', border: '#E2E8F0' };
    }
  };

  const renderReportItem = ({ item }: { item: AttendanceReportRecord }) => {
    const badge = getStatusBadge(item.status);
    const dateObj = new Date(item.reportDate);
    const dayName = isNaN(dateObj.getTime())
      ? ''
      : dateObj.toLocaleDateString('en-US', { weekday: 'short' });

    return (
      <TouchableOpacity
        style={styles.historyCard}
        onPress={() => router.push(`/report/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.dateCol}>
            <View style={styles.dateTitleRow}>
              <Text style={styles.datePrimary}>{item.reportDate}</Text>
              {dayName ? <Text style={styles.dayBadge}>{dayName}</Text> : null}
            </View>
            <Text style={styles.revText}>Revision {item.revision}</Text>
          </View>

          <View style={[styles.statusTag, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.statusTagText, { color: badge.text }]}>{item.status}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownItem}>
            <Text style={styles.bLabel}>UNIT 1</Text>
            <Text style={[styles.bVal, { color: colors.unit1 }]}>{item.unit1Total}</Text>
          </View>
          <View style={styles.breakdownItem}>
            <Text style={styles.bLabel}>UNIT 2</Text>
            <Text style={[styles.bVal, { color: colors.unit2 }]}>{item.unit2Total}</Text>
          </View>
          <View style={styles.breakdownItem}>
            <Text style={styles.bLabel}>STAFF / SHIFT</Text>
            <Text style={styles.bVal}>{item.staffCount} / {item.shiftCount}</Text>
          </View>
          <View style={[styles.breakdownItem, styles.grandItem]}>
            <Text style={[styles.bLabel, { color: colors.primaryAccent }]}>GRAND TOTAL</Text>
            <Text style={[styles.bVal, styles.grandVal]}>{item.grandTotal}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterHint}>Tap for audit trail, approval controls & PDF</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search & Filter Header Bar */}
      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by date (YYYY-MM-DD)..."
            placeholderTextColor={colors.textMuted}
            value={searchDate}
            onChangeText={setSearchDate}
          />
          {searchDate.length > 0 && (
            <TouchableOpacity onPress={() => setSearchDate('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        <View style={styles.pillsRow}>
          {(['ALL', 'APPROVED', 'SUBMITTED', 'DRAFT'] as const).map((st) => {
            const active = statusFilter === st;
            return (
              <TouchableOpacity
                key={st}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setStatusFilter(st)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{st}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryAccent} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={renderReportItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primaryAccent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="folder-open-outline" size={36} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Matching Reports</Text>
              <Text style={styles.emptyDesc}>
                No reports found matching your date or status criteria.
              </Text>
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
    backgroundColor: '#F8FAFC',
  },
  filterBar: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
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
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillActive: {
    backgroundColor: colors.primaryNavy,
    borderColor: colors.primaryNavy,
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
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateCol: {
    flex: 1,
  },
  dateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePrimary: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  dayBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryAccent,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  revText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  breakdownRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  grandItem: {
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
  },
  bLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bVal: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  grandVal: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primaryAccent,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  cardFooterHint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 240,
  },
});
