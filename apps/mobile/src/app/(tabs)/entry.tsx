import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { syncEngine } from '../../services/syncEngine';
import { dbService } from '../../services/db';
import { ApiClient } from '../../services/api';
import {
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
  calculateAttendanceTotals,
  AttendanceReportInput,
  AttendanceSubmitInputSchema,
} from '@ad-garments/domain';
import { colors } from '../../theme/colors';

export default function AttendanceEntryScreen() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeUnit, setActiveUnit] = useState<'UNIT_1' | 'UNIT_2'>('UNIT_1');
  const [reportId, setReportId] = useState<string>('');
  const [revision, setRevision] = useState<number>(1);
  const [status, setStatus] = useState<string>('DRAFT');

  // Department counts
  const [entries, setEntries] = useState<Record<string, number | null>>({});
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [shiftCount, setShiftCount] = useState<number | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Load report when date changes
  useEffect(() => {
    let isMounted = true;
    const loadDateReport = async () => {
      setIsLoadingReport(true);
      setValidationErrors([]);
      setSaveBanner(null);

      try {
        // 1. Check local DB
        const local = await dbService.getLocalReportByDate(selectedDate);
        if (local && isMounted) {
          setReportId(local.id);
          setRevision(local.revision);
          setStatus(local.status);
          setEntries(local.entries);
          setStaffCount(local.staffCount);
          setShiftCount(local.shiftCount);
          setIsLoadingReport(false);
          return;
        }

        // 2. Check server
        try {
          const serverReports = await ApiClient.getReports({ date: selectedDate });
          if (serverReports && serverReports.length > 0 && isMounted) {
            const rep = serverReports[0];
            setReportId(rep.id);
            setRevision(rep.revision);
            setStatus(rep.status);
            setEntries(rep.entries);
            setStaffCount(rep.staffCount);
            setShiftCount(rep.shiftCount);
            await dbService.saveReportLocally(rep, 'SYNCED');
            setIsLoadingReport(false);
            return;
          }
        } catch {
          // Offline, use new local draft
        }

        // 3. New draft for this date
        if (isMounted) {
          setReportId(syncEngine.generateUUID());
          setRevision(1);
          setStatus('DRAFT');
          setEntries({});
          setStaffCount(null);
          setShiftCount(null);
        }
      } finally {
        if (isMounted) setIsLoadingReport(false);
      }
    };

    loadDateReport();
    return () => {
      isMounted = false;
    };
  }, [selectedDate]);

  // Live calculations
  const totals = useMemo(() => {
    const cleanEntries: Record<string, number> = {};
    for (const [k, v] of Object.entries(entries)) {
      if (typeof v === 'number' && !isNaN(v)) {
        cleanEntries[k] = v;
      }
    }
    return calculateAttendanceTotals(
      cleanEntries,
      staffCount ?? 0,
      shiftCount ?? 0
    );
  }, [entries, staffCount, shiftCount]);

  const handleEntryChange = (code: string, text: string) => {
    const val = text.trim() === '' ? null : parseInt(text, 10);
    setEntries((prev) => ({
      ...prev,
      [code]: isNaN(val as number) ? null : val,
    }));
  };

  const handleStaffChange = (text: string) => {
    const val = text.trim() === '' ? null : parseInt(text, 10);
    setStaffCount(isNaN(val as number) ? null : val);
  };

  const handleShiftChange = (text: string) => {
    const val = text.trim() === '' ? null : parseInt(text, 10);
    setShiftCount(isNaN(val as number) ? null : val);
  };

  const isReadOnly = status === 'APPROVED' || (status === 'SUBMITTED' && user?.role === 'SUPERVISOR');

  const handleSaveDraft = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveBanner(null);

    const payload: AttendanceReportInput = {
      id: reportId,
      factoryId: user.factoryId,
      reportDate: selectedDate,
      status: 'DRAFT',
      revision,
      entries: entries as Record<string, number>,
      staffCount,
      shiftCount,
    };

    try {
      await syncEngine.saveDraft(payload, user, revision === 1);
      setSaveBanner('Draft saved locally & queued for synchronization.');
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setValidationErrors([]);

    // Validate submission schema
    const payload = {
      id: reportId,
      factoryId: user.factoryId,
      reportDate: selectedDate,
      entries,
      staffCount,
      shiftCount,
    };

    const result = AttendanceSubmitInputSchema.safeParse(payload);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      setValidationErrors(msgs);
      Alert.alert('Incomplete Attendance', 'All 16 department headcounts, STAFF, and SHIFT must be explicitly entered before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Save latest draft first
      await syncEngine.saveDraft(
        { ...payload, status: 'SUBMITTED' } as AttendanceReportInput,
        user,
        false
      );

      // Attempt immediate submit via API
      try {
        const submitted = await ApiClient.submitReport(reportId, revision);
        setStatus('SUBMITTED');
        setRevision(submitted.revision);
        await dbService.saveReportLocally(submitted, 'SYNCED');
        Alert.alert('Success', 'Attendance report submitted successfully!');
      } catch (netErr: any) {
        // Enqueue SUBMIT operation offline
        await dbService.enqueueSyncOperation({
          operation_id: syncEngine.generateUUID(),
          report_id: reportId,
          operation_type: 'SUBMIT',
          base_revision: revision,
          payload_json: JSON.stringify({ revision }),
          created_at: new Date().toISOString(),
        });
        setStatus('SUBMITTED');
        Alert.alert('Saved Offline', 'Report marked as submitted and will synchronize when back online.');
      }
    } catch (err: any) {
      Alert.alert('Submission Error', err.message || 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Sticky Grand Total Bar */}
      <View style={styles.grandTotalHeader}>
        <View style={styles.grandTotalCol}>
          <Text style={styles.grandTotalFormula}>U1: {totals.unit1Total} &bull; U2: {totals.unit2Total} &bull; Staff: {staffCount ?? 0} &bull; Shift: {shiftCount ?? 0}</Text>
          <Text style={styles.grandTotalLabel}>GRAND TOTAL HEADCOUNT</Text>
        </View>
        <Text style={styles.grandTotalNumber}>{totals.grandTotal}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Date Selector Banner */}
        <View style={styles.dateBar}>
          <View>
            <Text style={styles.dateBarLabel}>REPORT DATE</Text>
            <Text style={styles.dateBarValue}>{selectedDate}</Text>
          </View>
          <View style={styles.dateControls}>
            <TouchableOpacity
              style={styles.dateStepBtn}
              onPress={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.todayBtn}
              onPress={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            >
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateStepBtn}
              onPress={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Alert if not DRAFT */}
        {status !== 'DRAFT' && (
          <View style={[styles.statusBanner, status === 'APPROVED' ? styles.approvedBanner : styles.submittedBanner]}>
            <Ionicons
              name={status === 'APPROVED' ? 'checkmark-circle' : 'time'}
              size={18}
              color={status === 'APPROVED' ? colors.approved : colors.submitted}
            />
            <Text style={styles.statusBannerText}>
              This report is {status} (Rev {revision}). {isReadOnly ? 'Editing is locked.' : ''}
            </Text>
          </View>
        )}

        {saveBanner && (
          <View style={styles.successBanner}>
            <Ionicons name="cloud-done-outline" size={18} color={colors.synced} />
            <Text style={styles.successBannerText}>{saveBanner}</Text>
          </View>
        )}

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxTitle}>Missing Fields ({validationErrors.length}):</Text>
            {validationErrors.slice(0, 3).map((err, idx) => (
              <Text key={idx} style={styles.errorItem}>&bull; {err}</Text>
            ))}
            {validationErrors.length > 3 && (
              <Text style={styles.errorItem}>...and {validationErrors.length - 3} more department(s)</Text>
            )}
          </View>
        )}

        {/* Unit Segment Switcher */}
        <View style={styles.unitSwitcher}>
          <TouchableOpacity
            style={[styles.unitTab, activeUnit === 'UNIT_1' && styles.unitTabActive]}
            onPress={() => setActiveUnit('UNIT_1')}
          >
            <Text style={[styles.unitTabText, activeUnit === 'UNIT_1' && styles.unitTabTextActive]}>
              UNIT 1 ({totals.unit1Total})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitTab, activeUnit === 'UNIT_2' && styles.unitTabActive]}
            onPress={() => setActiveUnit('UNIT_2')}
          >
            <Text style={[styles.unitTabText, activeUnit === 'UNIT_2' && styles.unitTabTextActive]}>
              UNIT 2 ({totals.unit2Total})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Department Inputs List */}
        {isLoadingReport ? (
          <ActivityIndicator size="large" color={colors.primaryAccent} style={{ marginVertical: 32 }} />
        ) : (
          <View style={styles.fieldsContainer}>
            {activeUnit === 'UNIT_1' ? (
              <>
                <Text style={styles.unitHeaderSubtitle}>UNIT 1 DEPARTMENTS (8 FIELDS)</Text>
                {UNIT_1_DEPARTMENTS.map((dept) => {
                  const val = entries[dept.code];
                  return (
                    <View key={dept.code} style={styles.fieldRow}>
                      <View style={styles.labelCol}>
                        <Text style={styles.deptLabel}>{dept.label}</Text>
                        <Text style={styles.deptCode}>{dept.code}</Text>
                      </View>
                      <TextInput
                        style={[styles.numericInput, isReadOnly && styles.readOnlyInput]}
                        value={val !== null && val !== undefined ? String(val) : ''}
                        onChangeText={(txt) => handleEntryChange(dept.code, txt)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        editable={!isReadOnly}
                      />
                    </View>
                  );
                })}

                {/* STAFF for Unit 1 */}
                <View style={[styles.fieldRow, styles.adjustmentRow]}>
                  <View style={styles.labelCol}>
                    <Text style={[styles.deptLabel, { color: colors.primaryAccent }]}>STAFF (U1)</Text>
                    <Text style={styles.deptCode}>Unit 1 Staff Count</Text>
                  </View>
                  <TextInput
                    style={[styles.numericInput, styles.adjustmentInput, isReadOnly && styles.readOnlyInput]}
                    value={staffCount !== null && staffCount !== undefined ? String(staffCount) : ''}
                    onChangeText={handleStaffChange}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!isReadOnly}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.unitHeaderSubtitle}>UNIT 2 DEPARTMENTS (8 FIELDS)</Text>
                {UNIT_2_DEPARTMENTS.map((dept) => {
                  const val = entries[dept.code];
                  return (
                    <View key={dept.code} style={styles.fieldRow}>
                      <View style={styles.labelCol}>
                        <Text style={styles.deptLabel}>{dept.label}</Text>
                        <Text style={styles.deptCode}>{dept.code}</Text>
                      </View>
                      <TextInput
                        style={[styles.numericInput, isReadOnly && styles.readOnlyInput]}
                        value={val !== null && val !== undefined ? String(val) : ''}
                        onChangeText={(txt) => handleEntryChange(dept.code, txt)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        editable={!isReadOnly}
                      />
                    </View>
                  );
                })}

                {/* SHIFT for Unit 2 */}
                <View style={[styles.fieldRow, styles.adjustmentRow]}>
                  <View style={styles.labelCol}>
                    <Text style={[styles.deptLabel, { color: colors.unit2 }]}>SHIFT (U2)</Text>
                    <Text style={styles.deptCode}>Unit 2 Shift Workers</Text>
                  </View>
                  <TextInput
                    style={[styles.numericInput, styles.adjustmentInput, isReadOnly && styles.readOnlyInput]}
                    value={shiftCount !== null && shiftCount !== undefined ? String(shiftCount) : ''}
                    onChangeText={handleShiftChange}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!isReadOnly}
                  />
                </View>
              </>
            )}
          </View>
        )}

        {/* Action Buttons */}
        {!isReadOnly && (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.draftButton, isSaving && styles.btnDisabled]}
              onPress={handleSaveDraft}
              disabled={isSaving || isSubmitting}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color={colors.text} style={{ marginRight: 6 }} />
                  <Text style={styles.draftButtonText}>Save Draft</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={isSaving || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitButtonText}>Submit Report</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  grandTotalHeader: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  grandTotalCol: {
    flex: 1,
  },
  grandTotalLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  grandTotalFormula: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  grandTotalNumber: {
    color: '#38BDF8',
    fontSize: 32,
    fontWeight: '900',
    marginLeft: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  dateBar: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  dateBarLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  dateBarValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  approvedBanner: {
    backgroundColor: colors.approvedBg,
  },
  submittedBanner: {
    backgroundColor: colors.submittedBg,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  successBannerText: {
    fontSize: 12,
    color: colors.synced,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: colors.conflictBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBoxTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.conflict,
    marginBottom: 4,
  },
  errorItem: {
    fontSize: 12,
    color: colors.conflict,
  },
  unitSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  unitTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  unitTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  unitTabTextActive: {
    color: colors.primary,
  },
  unitHeaderSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  fieldsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 20,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  adjustmentRow: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
    marginTop: 8,
    borderRadius: 6,
  },
  labelCol: {
    flex: 1,
  },
  deptLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  deptCode: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
    fontWeight: '500',
  },
  numericInput: {
    width: 90,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  adjustmentInput: {
    backgroundColor: '#ffffff',
    borderColor: colors.primaryAccent,
  },
  readOnlyInput: {
    backgroundColor: '#E2E8F0',
    color: '#64748B',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  draftButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  submitButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.primaryAccent,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
