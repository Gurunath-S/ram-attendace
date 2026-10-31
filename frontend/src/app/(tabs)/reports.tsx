import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiClient } from '../../services/api';
import { PdfService } from '../../services/pdfService';
import { dbService } from '../../services/db';
import { colors } from '../../theme/colors';

export default function ReportsScreen() {
  const [tab, setTab] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [weekStart, setWeekStart] = useState('2026-10-19');
  const [selectedMonth, setSelectedMonth] = useState('2026-10');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [tab, weekStart, selectedMonth]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      if (tab === 'WEEKLY') {
        const res = await ApiClient.getWeekly(weekStart);
        setReportData(res);
      } else {
        const res = await ApiClient.getMonthly(selectedMonth);
        setReportData(res);
      }
    } catch {
      // Offline fallback: compute aggregates dynamically from local SQLite/storage reports
      const localReports = await dbService.getAllLocalReports();
      const filtered = localReports.filter((r) => {
        if (tab === 'WEEKLY') {
          return r.reportDate >= weekStart;
        } else {
          return r.reportDate.startsWith(selectedMonth);
        }
      });

      const totalRecorded = filtered.length;
      const grandSum = filtered.reduce((acc, r) => acc + r.grandTotal, 0);

      setReportData({
        weekStart,
        month: selectedMonth,
        totalDaysRecorded: totalRecorded,
        weeklyGrandTotal: grandSum,
        monthlyGrandTotal: grandSum,
        averageGrandTotal: totalRecorded > 0 ? Math.round(grandSum / totalRecorded) : 0,
        days: filtered.map((r) => ({
          date: r.reportDate,
          recorded: true,
          status: r.status,
          unit1Total: r.unit1Total,
          unit2Total: r.unit2Total,
          staffCount: r.staffCount,
          shiftCount: r.shiftCount,
          grandTotal: r.grandTotal,
        })),
        isOfflineComputed: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!reportData?.days || reportData.days.length === 0) {
      Alert.alert('No Data', 'No records found to export for the selected period.');
      return;
    }

    setIsExporting(true);
    try {
      const mockRecord = {
        id: 'PERIOD-REPORT',
        factoryId: 'factory-1',
        reportDate: tab === 'WEEKLY' ? `Week of ${weekStart}` : `Month of ${selectedMonth}`,
        status: 'APPROVED' as any,
        revision: 1,
        unit1Total: reportData.days.reduce((acc: number, d: any) => acc + (d.unit1Total || 0), 0),
        unit2Total: reportData.days.reduce((acc: number, d: any) => acc + (d.unit2Total || 0), 0),
        staffCount: reportData.days.reduce((acc: number, d: any) => acc + (d.staffCount || 0), 0),
        shiftCount: reportData.days.reduce((acc: number, d: any) => acc + (d.shiftCount || 0), 0),
        grandTotal: tab === 'WEEKLY' ? reportData.weeklyGrandTotal : reportData.monthlyGrandTotal,
        entries: {},
        createdBy: 'supervisor',
      };

      await PdfService.printAndShare(mockRecord as any);
    } catch (err: any) {
      Alert.alert('Export Error', err.message || 'Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  // Find max headcount for bar chart height scaling
  const maxDayCount = reportData?.days
    ? Math.max(...reportData.days.map((d: any) => d.grandTotal || 0), 1)
    : 100;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Horizon Switcher */}
      <View style={styles.tabPillContainer}>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'WEEKLY' && styles.tabPillActive]}
          onPress={() => setTab('WEEKLY')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="calendar"
            size={14}
            color={tab === 'WEEKLY' ? '#ffffff' : colors.textSecondary}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabPillText, tab === 'WEEKLY' && styles.tabPillTextActive]}>
            Weekly Aggregation
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, tab === 'MONTHLY' && styles.tabPillActive]}
          onPress={() => setTab('MONTHLY')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="pie-chart"
            size={14}
            color={tab === 'MONTHLY' ? '#ffffff' : colors.textSecondary}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabPillText, tab === 'MONTHLY' && styles.tabPillTextActive]}>
            Monthly Overview
          </Text>
        </TouchableOpacity>
      </View>

      {/* Period Scrubber Bar */}
      <View style={styles.periodScrubber}>
        <View>
          <Text style={styles.scrubberLabel}>
            {tab === 'WEEKLY' ? 'WEEK TIMEFRAME' : 'MONTH TIMEFRAME'}
          </Text>
          <Text style={styles.scrubberDate}>
            {tab === 'WEEKLY' ? `Week Starting ${weekStart}` : `Month ${selectedMonth}`}
          </Text>
        </View>

        <View style={styles.scrubberArrows}>
          <TouchableOpacity
            style={styles.scrubBtn}
            onPress={() => {
              if (tab === 'WEEKLY') {
                const d = new Date(weekStart);
                d.setDate(d.getDate() - 7);
                setWeekStart(d.toISOString().split('T')[0]);
              } else {
                const parts = selectedMonth.split('-');
                let y = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10) - 1;
                if (m < 1) {
                  m = 12;
                  y -= 1;
                }
                setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
              }
            }}
          >
            <Ionicons name="chevron-back" size={16} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.scrubBtn}
            onPress={() => {
              if (tab === 'WEEKLY') {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(d.toISOString().split('T')[0]);
              } else {
                const parts = selectedMonth.split('-');
                let y = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10) + 1;
                if (m > 12) {
                  m = 1;
                  y += 1;
                }
                setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
              }
            }}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryAccent} style={{ marginVertical: 48 }} />
      ) : reportData ? (
        <>
          {/* Executive KPI Cards */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="documents" size={18} color={colors.primaryAccent} />
              </View>
              <Text style={styles.kpiLabel}>DAYS RECORDED</Text>
              <Text style={styles.kpiNumber}>{reportData.totalDaysRecorded}</Text>
              <Text style={styles.kpiSub}>Audited Production</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="trending-up" size={18} color={colors.approved} />
              </View>
              <Text style={styles.kpiLabel}>DAILY AVERAGE</Text>
              <Text style={[styles.kpiNumber, { color: colors.approved }]}>
                {reportData.averageGrandTotal}
              </Text>
              <Text style={styles.kpiSub}>Workers / Day</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#FAF5FF' }]}>
                <Ionicons name="trophy" size={18} color={colors.reopened} />
              </View>
              <Text style={styles.kpiLabel}>TOTAL HEADCOUNT</Text>
              <Text style={[styles.kpiNumber, { color: colors.reopened }]}>
                {tab === 'WEEKLY' ? reportData.weeklyGrandTotal : reportData.monthlyGrandTotal}
              </Text>
              <Text style={styles.kpiSub}>Cumulative Period</Text>
            </View>
          </View>

          {/* Daily Headcount Sparkline Bar Chart */}
          {reportData.days && reportData.days.length > 0 && (
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>HEADCOUNT FLUCTUATION TREND</Text>
                <Text style={styles.chartLegend}>Max: {maxDayCount} workers</Text>
              </View>

              <View style={styles.barsContainer}>
                {reportData.days.slice(0, 7).map((d: any, idx: number) => {
                  const count = d.grandTotal || 0;
                  const heightPct = Math.max(12, Math.round((count / maxDayCount) * 100));
                  const isTop = count === maxDayCount && count > 0;

                  return (
                    <View key={idx} style={styles.barCol}>
                      <Text style={[styles.barValueLabel, isTop && { color: colors.primaryAccent, fontWeight: '900' }]}>
                        {count > 0 ? count : '-'}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${heightPct}%`,
                              backgroundColor: isTop ? colors.primaryAccent : '#94A3B8',
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.barDayLabel}>
                        {new Date(d.date).toLocaleDateString('en-US', { weekday: 'narrow' }) || `D${idx + 1}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Export Action Bar */}
          <View style={styles.exportSection}>
            <TouchableOpacity
              style={styles.pdfExportBtn}
              onPress={handleExportPdf}
              disabled={isExporting}
              activeOpacity={0.85}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={17} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.pdfExportBtnText}>Generate Official PDF Document</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Granular Breakdown Table */}
          <Text style={styles.tableOverline}>DAILY BREAKDOWN AUDIT</Text>
          <View style={styles.tableCard}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHCell, { flex: 1.4, textAlign: 'left' }]}>Date</Text>
              <Text style={styles.tableHCell}>Unit 1</Text>
              <Text style={styles.tableHCell}>Unit 2</Text>
              <Text style={styles.tableHCell}>Staff</Text>
              <Text style={styles.tableHCell}>Shift</Text>
              <Text style={[styles.tableHCell, { fontWeight: '900', color: colors.primaryAccent }]}>
                Total
              </Text>
            </View>

            {(reportData.days || []).map((day: any, idx: number) => {
              const hasData = day.recorded || day.grandTotal !== undefined;
              return (
                <View key={idx} style={[styles.tableDataRow, idx % 2 === 1 && styles.tableDataRowAlt]}>
                  <Text style={[styles.tableDCell, { flex: 1.4, textAlign: 'left', fontWeight: '700' }]}>
                    {day.date}
                  </Text>
                  <Text style={styles.tableDCell}>{hasData ? (day.unit1Total ?? '-') : '-'}</Text>
                  <Text style={styles.tableDCell}>{hasData ? (day.unit2Total ?? '-') : '-'}</Text>
                  <Text style={styles.tableDCell}>{hasData ? (day.staffCount ?? '-') : '-'}</Text>
                  <Text style={styles.tableDCell}>{hasData ? (day.shiftCount ?? '-') : '-'}</Text>
                  <Text
                    style={[
                      styles.tableDCell,
                      {
                        fontWeight: '900',
                        color: hasData ? colors.text : colors.textMuted,
                      },
                    ]}
                  >
                    {hasData ? day.grandTotal : '--'}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
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
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  tabPillContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabPillActive: {
    backgroundColor: colors.primaryNavy,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabPillTextActive: {
    color: '#ffffff',
  },
  periodScrubber: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  scrubberLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  scrubberDate: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  scrubberArrows: {
    flexDirection: 'row',
    gap: 8,
  },
  scrubBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  kpiNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  chartLegend: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 10,
    gap: 10,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValueLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
  },
  barTrack: {
    width: '60%',
    height: 80,
    justifyContent: 'flex-end',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barDayLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  exportSection: {
    marginBottom: 16,
  },
  pdfExportBtn: {
    backgroundColor: colors.primaryAccent,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryAccent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  pdfExportBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  tableOverline: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  tableDataRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableDCell: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
});
