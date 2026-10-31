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
    } catch (err: any) {
      // If offline, compute aggregates from local SQLite reports
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
      // Generate summary PDF for the recorded days
      const firstDay = reportData.days[0];
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Type Switcher */}
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'WEEKLY' && styles.segmentBtnActive]}
          onPress={() => setTab('WEEKLY')}
        >
          <Text style={[styles.segmentBtnText, tab === 'WEEKLY' && styles.segmentBtnTextActive]}>
            Weekly Report
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'MONTHLY' && styles.segmentBtnActive]}
          onPress={() => setTab('MONTHLY')}
        >
          <Text style={[styles.segmentBtnText, tab === 'MONTHLY' && styles.segmentBtnTextActive]}>
            Monthly Report
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Selectors */}
      <View style={styles.filterCard}>
        <View>
          <Text style={styles.filterLabel}>{tab === 'WEEKLY' ? 'WEEK STARTING' : 'CALENDAR MONTH'}</Text>
          <Text style={styles.filterVal}>{tab === 'WEEKLY' ? weekStart : selectedMonth}</Text>
        </View>

        <View style={styles.filterActions}>
          <TouchableOpacity
            style={styles.stepBtn}
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
            style={styles.stepBtn}
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
        <ActivityIndicator size="large" color={colors.primaryAccent} style={{ marginVertical: 40 }} />
      ) : reportData ? (
        <>
          {/* Summary KPIs */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxLabel}>TOTAL RECORDED</Text>
              <Text style={styles.summaryBoxNum}>{reportData.totalDaysRecorded} Days</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxLabel}>DAILY AVERAGE</Text>
              <Text style={[styles.summaryBoxNum, { color: colors.primaryAccent }]}>
                {reportData.averageGrandTotal}
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxLabel}>PERIOD TOTAL</Text>
              <Text style={[styles.summaryBoxNum, { color: colors.approved }]}>
                {tab === 'WEEKLY' ? reportData.weeklyGrandTotal : reportData.monthlyGrandTotal}
              </Text>
            </View>
          </View>

          {/* Export Actions */}
          <View style={styles.exportBar}>
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={handleExportPdf}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.exportBtnText}>Share & Save PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Breakdown Table */}
          <Text style={styles.tableHeader}>DAILY HEADCOUNT BREAKDOWN</Text>
          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>Date</Text>
              <Text style={styles.tableHeadCell}>U1</Text>
              <Text style={styles.tableHeadCell}>U2</Text>
              <Text style={styles.tableHeadCell}>Staff</Text>
              <Text style={styles.tableHeadCell}>Shift</Text>
              <Text style={[styles.tableHeadCell, { fontWeight: '800', color: colors.primaryAccent }]}>Grand</Text>
            </View>

            {(reportData.days || []).map((day: any, idx: number) => {
              const hasData = day.recorded || day.grandTotal !== undefined;
              return (
                <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 1.2, fontWeight: '600' }]}>{day.date}</Text>
                  <Text style={styles.tableCell}>{hasData ? (day.unit1Total ?? '-') : '-'}</Text>
                  <Text style={styles.tableCell}>{hasData ? (day.unit2Total ?? '-') : '-'}</Text>
                  <Text style={styles.tableCell}>{hasData ? (day.staffCount ?? '-') : '-'}</Text>
                  <Text style={styles.tableCell}>{hasData ? (day.shiftCount ?? '-') : '-'}</Text>
                  <Text style={[styles.tableCell, { fontWeight: '800', color: hasData ? colors.text : colors.textMuted }]}>
                    {hasData ? day.grandTotal : 'None'}
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
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: colors.primary,
  },
  filterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  filterVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryBoxLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  summaryBoxNum: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginTop: 4,
  },
  exportBar: {
    marginBottom: 16,
  },
  exportBtn: {
    backgroundColor: colors.primaryAccent,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  tableHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeadCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
  },
});
