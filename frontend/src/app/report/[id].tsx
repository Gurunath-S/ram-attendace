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
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../services/api';
import { dbService } from '../../services/db';
import { PdfService } from '../../services/pdfService';
import {
  AttendanceReportRecord,
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
} from '@ad-garments/domain';
import { colors } from '../../theme/colors';

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isManager, isAdmin } = useAuth();
  const [report, setReport] = useState<AttendanceReportRecord | null>(null);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    loadReportDetails();
  }, [id]);

  const loadReportDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Try server first
      try {
        const rep = await ApiClient.getReportById(id);
        setReport(rep);
        const audits = await ApiClient.getAuditEvents(id);
        setAuditEvents(audits);
        await dbService.saveReportLocally(rep, 'SYNCED');
        return;
      } catch {
        // Fallback to local DB
      }

      // 2. Local DB
      const local = await dbService.getLocalReportById(id);
      if (local) {
        setReport(local);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSharePdf = async () => {
    if (!report) return;
    setIsSharing(true);
    try {
      await PdfService.printAndShare(report);
    } catch (err: any) {
      Alert.alert('Share Failed', err.message || 'Could not generate PDF');
    } finally {
      setIsSharing(false);
    }
  };

  const handleApprove = async () => {
    if (!report) return;
    setActionLoading(true);
    try {
      const updated = await ApiClient.approveReport(report.id);
      setReport(updated);
      await dbService.saveReportLocally(updated, 'SYNCED');
      Alert.alert('Approved', 'This attendance report has been officially approved.');
      loadReportDetails();
    } catch (err: any) {
      Alert.alert('Approval Error', err.message || 'Failed to approve report');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!report) return;
    setActionLoading(true);
    try {
      const updated = await ApiClient.reopenReport(report.id);
      setReport(updated);
      await dbService.saveReportLocally(updated, 'SYNCED');
      Alert.alert('Reopened', 'Report reopened for supervisor corrections.');
      loadReportDetails();
    } catch (err: any) {
      Alert.alert('Reopen Error', err.message || 'Failed to reopen report');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryAccent} />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>Report Record Not Found</Text>
      </View>
    );
  }

  const getStatusBadge = (st: string) => {
    switch (st) {
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

  const badge = getStatusBadge(report.status);
  const canApprove = (isManager || isAdmin) && report.status === 'SUBMITTED';
  const canReopen = (isManager || isAdmin) && report.status === 'APPROVED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Inspection Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.dateText}>{report.reportDate}</Text>
            <Text style={styles.revText}>Official Audit &bull; Revision {report.revision}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{report.status}</Text>
          </View>
        </View>

        {/* Grand Total Hero Display */}
        <View style={styles.heroBox}>
          <View>
            <Text style={styles.heroLabel}>AUDITED GRAND TOTAL HEADCOUNT</Text>
            <Text style={styles.heroFormula}>
              U1 ({report.unit1Total}) + U2 ({report.unit2Total}) + Staff ({report.staffCount}) + Shift ({report.shiftCount})
            </Text>
          </View>
          <Text style={styles.heroNumber}>{report.grandTotal}</Text>
        </View>

        {/* PDF Share Action */}
        <TouchableOpacity
          style={styles.pdfBtn}
          onPress={handleSharePdf}
          disabled={isSharing}
          activeOpacity={0.85}
        >
          {isSharing ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={17} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.pdfBtnText}>Generate & Share Official PDF</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Manager/Admin Approval Controls */}
        {canApprove && (
          <TouchableOpacity
            style={styles.approveBtn}
            onPress={handleApprove}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            {actionLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.approveBtnText}>Approve Attendance Report</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {canReopen && (
          <TouchableOpacity
            style={styles.reopenBtn}
            onPress={handleReopen}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            {actionLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.reopenBtnText}>Reopen Report for Corrections</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Breakdown: Unit 1 */}
      <Text style={styles.sectionTitle}>UNIT 1 BREAKDOWN &bull; TOTAL: {report.unit1Total}</Text>
      <View style={styles.tableCard}>
        {UNIT_1_DEPARTMENTS.map((dept) => (
          <View key={dept.code} style={styles.deptRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.deptNumBadge}>
                <Text style={styles.deptNumText}>{dept.order}</Text>
              </View>
              <Text style={styles.deptName}>{dept.label}</Text>
            </View>
            <Text style={styles.deptVal}>{report.entries[dept.code] ?? '-'}</Text>
          </View>
        ))}
        <View style={[styles.deptRow, styles.subtotalRow]}>
          <Text style={[styles.deptName, { fontWeight: '900' }]}>UNIT 1 TOTAL HEADCOUNT</Text>
          <Text style={[styles.deptVal, { fontWeight: '900', color: colors.unit1 }]}>
            {report.unit1Total}
          </Text>
        </View>
        <View style={[styles.deptRow, { backgroundColor: '#F0F9FF' }]}>
          <Text style={[styles.deptName, { fontWeight: '800', color: colors.unit1 }]}>STAFF (U1)</Text>
          <Text style={[styles.deptVal, { fontWeight: '900' }]}>{report.staffCount}</Text>
        </View>
      </View>

      {/* Breakdown: Unit 2 */}
      <Text style={styles.sectionTitle}>UNIT 2 BREAKDOWN &bull; TOTAL: {report.unit2Total}</Text>
      <View style={styles.tableCard}>
        {UNIT_2_DEPARTMENTS.map((dept) => (
          <View key={dept.code} style={styles.deptRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.deptNumBadge, { backgroundColor: '#EEF2FF' }]}>
                <Text style={[styles.deptNumText, { color: colors.unit2 }]}>{dept.order}</Text>
              </View>
              <Text style={styles.deptName}>{dept.label}</Text>
            </View>
            <Text style={styles.deptVal}>{report.entries[dept.code] ?? '-'}</Text>
          </View>
        ))}
        <View style={[styles.deptRow, styles.subtotalRow]}>
          <Text style={[styles.deptName, { fontWeight: '900' }]}>UNIT 2 TOTAL HEADCOUNT</Text>
          <Text style={[styles.deptVal, { fontWeight: '900', color: colors.unit2 }]}>
            {report.unit2Total}
          </Text>
        </View>
        <View style={[styles.deptRow, { backgroundColor: '#FAF5FF' }]}>
          <Text style={[styles.deptName, { fontWeight: '800', color: colors.shift }]}>SHIFT (U2)</Text>
          <Text style={[styles.deptVal, { fontWeight: '900' }]}>{report.shiftCount}</Text>
        </View>
      </View>

      {/* Audit Log Timeline */}
      <Text style={styles.sectionTitle}>AUDIT LOGS & EVENT TRACE ({auditEvents.length})</Text>
      <View style={styles.tableCard}>
        {auditEvents.length === 0 ? (
          <Text style={styles.noAuditText}>No audit entries recorded for this report</Text>
        ) : (
          auditEvents.map((ev, idx) => (
            <View key={idx} style={styles.auditRow}>
              <View style={styles.auditIconCol}>
                <Ionicons name="git-commit" size={16} color={colors.primaryAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.auditAction}>{ev.action}</Text>
                  <Text style={styles.auditRev}>Rev {ev.revision}</Text>
                </View>
                <Text style={styles.auditActor}>
                  By: {ev.actor_name || 'System'} ({ev.actor_role})
                </Text>
                <Text style={styles.auditTime}>{new Date(ev.created_at).toLocaleString()}</Text>
              </View>
            </View>
          ))
        )}
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
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  revText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  heroFormula: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 4,
  },
  heroNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: -1,
  },
  pdfBtn: {
    backgroundColor: colors.primaryNavy,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  approveBtn: {
    backgroundColor: colors.approved,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  approveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  reopenBtn: {
    backgroundColor: colors.reopened,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  reopenBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  deptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  deptNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptNumText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  subtotalRow: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: -14,
    paddingHorizontal: 14,
  },
  deptName: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '700',
  },
  deptVal: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  noAuditText: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingVertical: 16,
    textAlign: 'center',
  },
  auditRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  auditIconCol: {
    paddingTop: 2,
  },
  auditAction: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  auditRev: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  auditActor: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  auditTime: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
});
