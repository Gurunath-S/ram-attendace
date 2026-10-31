import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { syncEngine } from '../../services/syncEngine';
import { dbService } from '../../services/db';
import { ApiClient } from '../../services/api';
import {
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
  DepartmentConfig,
  calculateAttendanceTotals,
  validateUniqueDepartment,
  AttendanceReportInput,
} from '@ad-garments/domain';
import { colors } from '../../theme/colors';

export default function AttendanceEntryScreen() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeUnit, setActiveUnit] = useState<'UNIT_1' | 'UNIT_2'>('UNIT_1');
  const [reportId, setReportId] = useState<string>('');
  const [revision, setRevision] = useState<number>(1);
  const [status, setStatus] = useState<string>('DRAFT');

  // Dynamic department lists per unit
  const [unit1Depts, setUnit1Depts] = useState<DepartmentConfig[]>(UNIT_1_DEPARTMENTS);
  const [unit2Depts, setUnit2Depts] = useState<DepartmentConfig[]>(UNIT_2_DEPARTMENTS);

  // Department counts
  const [entries, setEntries] = useState<Record<string, number | null>>({});
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [shiftCount, setShiftCount] = useState<number | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Field Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalUnit, setModalUnit] = useState<'UNIT_1' | 'UNIT_2'>('UNIT_1');
  const [editingDept, setEditingDept] = useState<DepartmentConfig | null>(null);
  const [deptInputLabel, setDeptInputLabel] = useState('');
  const [isSubmittingDept, setIsSubmittingDept] = useState(false);

  // Load departments from local DB & API config on mount
  useEffect(() => {
    let isMounted = true;
    const loadDepartments = async () => {
      try {
        const cached = await dbService.getCachedDepartments();
        if (cached && isMounted) {
          if (cached.unit1?.length) setUnit1Depts(cached.unit1);
          if (cached.unit2?.length) setUnit2Depts(cached.unit2);
        }

        try {
          const cfg = await ApiClient.getConfig();
          if (cfg && cfg.departments && Array.isArray(cfg.departments) && isMounted) {
            const u1: DepartmentConfig[] = [];
            const u2: DepartmentConfig[] = [];
            for (const d of cfg.departments) {
              const item: DepartmentConfig = {
                id: d.id,
                code: d.code,
                label: d.label,
                unit: d.unitCode === 'UNIT_1' ? 'UNIT-1' : 'UNIT-2',
                order: d.sortOrder,
              };
              if (d.unitCode === 'UNIT_1') u1.push(item);
              else u2.push(item);
            }
            if (u1.length) setUnit1Depts(u1);
            if (u2.length) setUnit2Depts(u2);
            await dbService.saveCachedDepartments(u1, u2);
          }
        } catch {
          // Fallback to cached or defaults
        }
      } catch (err) {
        console.warn('[Entry] Department load error:', err);
      }
    };

    loadDepartments();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load report when date changes
  useEffect(() => {
    let isMounted = true;
    const loadDateReport = async () => {
      setIsLoadingReport(true);
      setValidationErrors([]);
      setSaveBanner(null);

      try {
        // 1. Instant check in local DB
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

        // 2. Fast background check from server if online
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
          // Offline fallback
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

  // Live in-memory deterministic calculations using dynamic unit lists
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
      shiftCount ?? 0,
      unit1Depts,
      unit2Depts
    );
  }, [entries, staffCount, shiftCount, unit1Depts, unit2Depts]);

  // Count how many of the departments + staff + shift are filled
  const completionStats = useMemo(() => {
    let filled = 0;
    const allCodes = [...unit1Depts, ...unit2Depts];
    allCodes.forEach((d) => {
      if (entries[d.code] !== null && entries[d.code] !== undefined) {
        filled++;
      }
    });
    if (staffCount !== null && staffCount !== undefined) filled++;
    if (shiftCount !== null && shiftCount !== undefined) filled++;
    const total = allCodes.length + 2;
    return {
      filled,
      total,
      pct: total > 0 ? Math.round((filled / total) * 100) : 0,
    };
  }, [entries, staffCount, shiftCount, unit1Depts, unit2Depts]);

  const handleEntryChange = (code: string, text: string) => {
    const val = text.trim() === '' ? null : parseInt(text, 10);
    setEntries((prev) => ({
      ...prev,
      [code]: isNaN(val as number) ? null : Math.max(0, val as number),
    }));
  };

  const handleStepCount = (code: string, delta: number) => {
    setEntries((prev) => {
      const current = typeof prev[code] === 'number' ? prev[code]! : 0;
      const next = Math.max(0, current + delta);
      return {
        ...prev,
        [code]: next,
      };
    });
  };

  const handleStaffStep = (delta: number) => {
    setStaffCount((prev) => Math.max(0, (prev ?? 0) + delta));
  };

  const handleShiftStep = (delta: number) => {
    setShiftCount((prev) => Math.max(0, (prev ?? 0) + delta));
  };

  // Quick Action: Copy from yesterday
  const handleCopyYesterday = async () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().split('T')[0];

    try {
      const yesterday = await dbService.getLocalReportByDate(yesterdayStr);
      if (yesterday && Object.keys(yesterday.entries).length > 0) {
        setEntries(yesterday.entries);
        setStaffCount(yesterday.staffCount);
        setShiftCount(yesterday.shiftCount);
        setSaveBanner(`Copied headcounts from ${yesterdayStr}`);
        return;
      }

      // Check server
      try {
        const serverReps = await ApiClient.getReports({ date: yesterdayStr });
        if (serverReps && serverReps.length > 0) {
          setEntries(serverReps[0].entries);
          setStaffCount(serverReps[0].staffCount);
          setShiftCount(serverReps[0].shiftCount);
          setSaveBanner(`Copied headcounts from ${yesterdayStr}`);
          return;
        }
      } catch {}

      Alert.alert('Notice', `No previous report record found for ${yesterdayStr}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // Quick Action: Fill zero for empty lines
  const handleFillZeroes = () => {
    const newEntries = { ...entries };
    const all = [...unit1Depts, ...unit2Depts];
    all.forEach((d) => {
      if (newEntries[d.code] === null || newEntries[d.code] === undefined) {
        newEntries[d.code] = 0;
      }
    });
    setEntries(newEntries);
    if (staffCount === null || staffCount === undefined) setStaffCount(0);
    if (shiftCount === null || shiftCount === undefined) setShiftCount(0);
    setSaveBanner('Zeroes filled for all unentered lines');
  };

  const isReadOnly = status === 'APPROVED' || (status === 'SUBMITTED' && user?.role === 'SUPERVISOR');

  // --- Department Field Add / Edit Modal Handlers ---
  const openAddModal = (unit: 'UNIT_1' | 'UNIT_2') => {
    setModalUnit(unit);
    setEditingDept(null);
    setDeptInputLabel('');
    setModalVisible(true);
  };

  const openEditModal = (dept: DepartmentConfig, unit: 'UNIT_1' | 'UNIT_2') => {
    setModalUnit(unit);
    setEditingDept(dept);
    setDeptInputLabel(dept.label);
    setModalVisible(true);
  };

  const closeDeptModal = () => {
    setModalVisible(false);
    setEditingDept(null);
    setDeptInputLabel('');
  };

  // Real-time duplicate validation: strictly prevents identical fields in the same unit
  const duplicateValidation = useMemo(() => {
    const list = modalUnit === 'UNIT_1' ? unit1Depts : unit2Depts;
    return validateUniqueDepartment(deptInputLabel, list, editingDept?.code);
  }, [deptInputLabel, modalUnit, unit1Depts, unit2Depts, editingDept]);

  const handleSaveDepartment = async () => {
    const trimmed = deptInputLabel.trim();
    if (!duplicateValidation.isValid || !trimmed) {
      Alert.alert('Invalid Field', duplicateValidation.error || 'Please provide a valid field name');
      return;
    }

    setIsSubmittingDept(true);
    try {
      if (editingDept) {
        // Editing existing department
        let updatedItem: DepartmentConfig = {
          ...editingDept,
          label: trimmed,
        };

        if (editingDept.id) {
          try {
            const apiRes = await ApiClient.updateDepartment(editingDept.id, trimmed);
            if (apiRes?.department) {
              updatedItem = {
                ...updatedItem,
                label: apiRes.department.label,
                id: apiRes.department.id,
              };
            }
          } catch (e: any) {
            console.warn('[Entry] Server edit failed, updating locally:', e.message);
          }
        }

        const nextU1 = modalUnit === 'UNIT_1'
          ? unit1Depts.map((d) => (d.code === editingDept.code ? updatedItem : d))
          : unit1Depts;
        const nextU2 = modalUnit === 'UNIT_2'
          ? unit2Depts.map((d) => (d.code === editingDept.code ? updatedItem : d))
          : unit2Depts;

        setUnit1Depts(nextU1);
        setUnit2Depts(nextU2);
        await dbService.saveCachedDepartments(nextU1, nextU2);
        setSaveBanner(`Field updated to "${trimmed}"`);
      } else {
        // Adding brand new department
        let createdDept: DepartmentConfig;
        let createdCode = `${modalUnit === 'UNIT_1' ? 'U1' : 'U2'}_${trimmed
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '_')
          .slice(0, 24)}`;

        try {
          const apiRes = await ApiClient.addDepartment(modalUnit, trimmed);
          if (apiRes?.department) {
            createdDept = {
              id: apiRes.department.id,
              code: apiRes.department.code,
              label: apiRes.department.label,
              unit: modalUnit === 'UNIT_1' ? 'UNIT-1' : 'UNIT-2',
              order: apiRes.department.sortOrder,
            };
          } else {
            throw new Error('Fallback to local');
          }
        } catch {
          // Offline local department generation
          const currentList = modalUnit === 'UNIT_1' ? unit1Depts : unit2Depts;
          // Ensure unique code
          if (currentList.some((d) => d.code === createdCode)) {
            createdCode = `${createdCode}_${Date.now().toString().slice(-4)}`;
          }
          createdDept = {
            code: createdCode,
            label: trimmed,
            unit: modalUnit === 'UNIT_1' ? 'UNIT-1' : 'UNIT-2',
            order: currentList.length + 1,
          };
        }

        const nextU1 = modalUnit === 'UNIT_1' ? [...unit1Depts, createdDept] : unit1Depts;
        const nextU2 = modalUnit === 'UNIT_2' ? [...unit2Depts, createdDept] : unit2Depts;

        setUnit1Depts(nextU1);
        setUnit2Depts(nextU2);
        await dbService.saveCachedDepartments(nextU1, nextU2);
        setSaveBanner(`Added new field "${trimmed}" to ${modalUnit === 'UNIT_1' ? 'Unit 1' : 'Unit 2'}`);
      }

      closeDeptModal();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save department field');
    } finally {
      setIsSubmittingDept(false);
    }
  };

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
      setSaveBanner('⚡ Draft saved locally (0ms) & queued for cloud sync');
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setValidationErrors([]);

    // Check completeness for all active department fields
    const missing: string[] = [];
    const allCurrentDepts = [...unit1Depts, ...unit2Depts];
    for (const d of allCurrentDepts) {
      if (entries[d.code] === null || entries[d.code] === undefined) {
        missing.push(`${d.label} (${d.unit})`);
      }
    }
    if (staffCount === null || staffCount === undefined) {
      missing.push('STAFF (U1)');
    }
    if (shiftCount === null || shiftCount === undefined) {
      missing.push('SHIFT (U2)');
    }

    if (missing.length > 0) {
      setValidationErrors(missing.map((m) => `Missing count for ${m}`));
      Alert.alert(
        'Incomplete Headcount',
        `All ${allCurrentDepts.length} department fields, STAFF, and SHIFT must be explicitly entered before submitting.`
      );
      return;
    }

    setIsSubmitting(true);
    const payload = {
      id: reportId,
      factoryId: user.factoryId,
      reportDate: selectedDate,
      entries,
      staffCount,
      shiftCount,
    };

    try {
      await syncEngine.saveDraft(
        { ...payload, status: 'SUBMITTED' } as AttendanceReportInput,
        user,
        false
      );

      try {
        const submitted = await ApiClient.submitReport(reportId, revision);
        setStatus('SUBMITTED');
        setRevision(submitted.revision);
        await dbService.saveReportLocally(submitted, 'SYNCED');
        Alert.alert('Success', 'Attendance report submitted successfully!');
      } catch {
        await dbService.enqueueSyncOperation({
          operation_id: syncEngine.generateUUID(),
          report_id: reportId,
          operation_type: 'SUBMIT',
          base_revision: revision,
          payload_json: JSON.stringify({ revision }),
          created_at: new Date().toISOString(),
        });
        setStatus('SUBMITTED');
        Alert.alert(
          'Saved to Local Queue',
          'Report marked as submitted locally and will sync automatically when online.'
        );
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
      {/* Sticky Heads-Up Display (HUD) */}
      <View style={styles.stickyHud}>
        <View style={styles.hudLeft}>
          <View style={styles.hudSubRow}>
            <Text style={styles.hudFormulaText}>
              U1: <Text style={styles.hudFormulaVal}>{totals.unit1Total}</Text> &bull; U2:{' '}
              <Text style={styles.hudFormulaVal}>{totals.unit2Total}</Text> &bull; Adj:{' '}
              <Text style={styles.hudFormulaVal}>{(staffCount ?? 0) + (shiftCount ?? 0)}</Text>
            </Text>
          </View>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${completionStats.pct}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {completionStats.filled}/{completionStats.total} ({completionStats.pct}%)
            </Text>
          </View>
        </View>

        <View style={styles.hudRight}>
          <Text style={styles.hudGrandNumber}>{totals.grandTotal}</Text>
          <Text style={styles.hudGrandLabel}>GRAND TOTAL</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Date Selector Scrubber */}
        <View style={styles.dateSelectorCard}>
          <View style={styles.dateInfoCol}>
            <Text style={styles.dateLabel}>REPORTING DATE</Text>
            <Text style={styles.dateDisplay}>
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.dateNavPills}>
            <TouchableOpacity
              style={styles.dateNavBtn}
              onPress={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}
            >
              <Ionicons name="chevron-back" size={16} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.todayPill,
                selectedDate === new Date().toISOString().split('T')[0] && styles.todayPillActive,
              ]}
              onPress={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            >
              <Text
                style={[
                  styles.todayPillText,
                  selectedDate === new Date().toISOString().split('T')[0] &&
                    styles.todayPillTextActive,
                ]}
              >
                Today
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateNavBtn}
              onPress={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Speed Helper Bar */}
        {!isReadOnly && (
          <View style={styles.speedHelpersBar}>
            <TouchableOpacity
              style={styles.speedHelperBtn}
              onPress={handleCopyYesterday}
              activeOpacity={0.7}
            >
              <Ionicons name="copy-outline" size={13} color={colors.primaryAccent} />
              <Text style={styles.speedHelperText}>Copy Yesterday</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.speedHelperBtn}
              onPress={handleFillZeroes}
              activeOpacity={0.7}
            >
              <Ionicons name="flash-outline" size={13} color={colors.primaryAccent} />
              <Text style={styles.speedHelperText}>Fill Zeroes</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status Notification */}
        {status !== 'DRAFT' && (
          <View
            style={[
              styles.statusBanner,
              status === 'APPROVED' ? styles.statusApproved : styles.statusSubmitted,
            ]}
          >
            <Ionicons
              name={status === 'APPROVED' ? 'checkmark-circle' : 'time'}
              size={18}
              color={status === 'APPROVED' ? colors.approved : colors.submitted}
            />
            <Text style={styles.statusBannerText}>
              Report is <Text style={{ fontWeight: '800' }}>{status}</Text> (Rev {revision}).{' '}
              {isReadOnly ? 'Editing locked.' : ''}
            </Text>
          </View>
        )}

        {saveBanner && (
          <View style={styles.toastBanner}>
            <Ionicons name="checkmark-circle" size={16} color={colors.synced} />
            <Text style={styles.toastBannerText}>{saveBanner}</Text>
          </View>
        )}

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <View style={styles.errorBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="alert-circle" size={16} color={colors.conflict} />
              <Text style={styles.errorTitle}>
                Missing Department Fields ({validationErrors.length})
              </Text>
            </View>
            {validationErrors.slice(0, 3).map((err, idx) => (
              <Text key={idx} style={styles.errorText}>
                &bull; {err}
              </Text>
            ))}
            {validationErrors.length > 3 && (
              <Text style={styles.errorMore}>
                ...and {validationErrors.length - 3} more department(s)
              </Text>
            )}
          </View>
        )}

        {/* Unit Segment Switcher */}
        <View style={styles.unitTabs}>
          <TouchableOpacity
            style={[styles.unitTab, activeUnit === 'UNIT_1' && styles.unitTabActiveU1]}
            onPress={() => setActiveUnit('UNIT_1')}
            activeOpacity={0.8}
          >
            <Text
              style={[styles.unitTabText, activeUnit === 'UNIT_1' && styles.unitTabTextActiveU1]}
            >
              UNIT 1 ({totals.unit1Total}) &bull; {unit1Depts.length} Fields
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.unitTab, activeUnit === 'UNIT_2' && styles.unitTabActiveU2]}
            onPress={() => setActiveUnit('UNIT_2')}
            activeOpacity={0.8}
          >
            <Text
              style={[styles.unitTabText, activeUnit === 'UNIT_2' && styles.unitTabTextActiveU2]}
            >
              UNIT 2 ({totals.unit2Total}) &bull; {unit2Depts.length} Fields
            </Text>
          </TouchableOpacity>
        </View>

        {/* Department Entry Rows */}
        {isLoadingReport ? (
          <ActivityIndicator size="large" color={colors.primaryAccent} style={{ marginVertical: 36 }} />
        ) : (
          <View style={styles.cardsList}>
            {activeUnit === 'UNIT_1' ? (
              <>
                {/* Unit 1 Header with "+ Add Field" button */}
                <View style={styles.unitHeaderRow}>
                  <Text style={styles.unitSectionSubtitle}>
                    UNIT 1 &bull; {unit1Depts.length} DEPARTMENTS
                  </Text>
                  {!isReadOnly && (
                    <TouchableOpacity
                      style={styles.addFieldHeaderBtn}
                      onPress={() => openAddModal('UNIT_1')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add-circle" size={16} color={colors.unit1} />
                      <Text style={styles.addFieldHeaderBtnText}>Add Field</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {unit1Depts.map((dept) => {
                  const val = entries[dept.code];
                  const hasValue = val !== null && val !== undefined;

                  return (
                    <View key={dept.code} style={[styles.deptCard, hasValue && styles.deptCardEntered]}>
                      <View style={styles.deptCardLeft}>
                        <View style={styles.orderCircle}>
                          <Text style={styles.orderCircleText}>{dept.order}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.deptNameRow}>
                            <Text style={styles.deptCardName}>{dept.label}</Text>
                            {!isReadOnly && (
                              <TouchableOpacity
                                style={styles.editFieldIconBtn}
                                onPress={() => openEditModal(dept, 'UNIT_1')}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="pencil" size={12} color={colors.textSecondary} />
                              </TouchableOpacity>
                            )}
                          </View>
                          <Text style={styles.deptCardCode}>{dept.code}</Text>
                        </View>
                      </View>

                      <View style={styles.inputStepperRow}>
                        {!isReadOnly && (
                          <TouchableOpacity
                            style={styles.stepBtnSmall}
                            onPress={() => handleStepCount(dept.code, -1)}
                          >
                            <Ionicons name="remove" size={16} color={colors.text} />
                          </TouchableOpacity>
                        )}

                        <TextInput
                          style={[styles.deptCardInput, isReadOnly && styles.readOnlyInput]}
                          value={hasValue ? String(val) : ''}
                          onChangeText={(txt) => handleEntryChange(dept.code, txt)}
                          keyboardType="number-pad"
                          placeholder="--"
                          placeholderTextColor={colors.textMuted}
                          editable={!isReadOnly}
                        />

                        {!isReadOnly && (
                          <>
                            <TouchableOpacity
                              style={styles.stepBtnSmall}
                              onPress={() => handleStepCount(dept.code, 1)}
                            >
                              <Ionicons name="add" size={16} color={colors.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.stepBtnJump}
                              onPress={() => handleStepCount(dept.code, 5)}
                            >
                              <Text style={styles.stepBtnJumpText}>+5</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Dashed Add Field Card */}
                {!isReadOnly && (
                  <TouchableOpacity
                    style={styles.addDashedCard}
                    onPress={() => openAddModal('UNIT_1')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.unit1} />
                    <Text style={styles.addDashedCardText}>Add New Field to Unit 1</Text>
                  </TouchableOpacity>
                )}

                {/* Staff Adjustment Card */}
                <View style={[styles.deptCard, styles.adjustmentCard]}>
                  <View style={styles.deptCardLeft}>
                    <View style={[styles.orderCircle, { backgroundColor: '#E0F2FE' }]}>
                      <Ionicons name="star" size={13} color={colors.unit1} />
                    </View>
                    <View>
                      <Text style={[styles.deptCardName, { color: colors.unit1 }]}>STAFF (U1)</Text>
                      <Text style={styles.deptCardCode}>Administrative Adjustment</Text>
                    </View>
                  </View>

                  <View style={styles.inputStepperRow}>
                    {!isReadOnly && (
                      <TouchableOpacity
                        style={styles.stepBtnSmall}
                        onPress={() => handleStaffStep(-1)}
                      >
                        <Ionicons name="remove" size={16} color={colors.text} />
                      </TouchableOpacity>
                    )}

                    <TextInput
                      style={[
                        styles.deptCardInput,
                        styles.adjustmentInput,
                        isReadOnly && styles.readOnlyInput,
                      ]}
                      value={staffCount !== null && staffCount !== undefined ? String(staffCount) : ''}
                      onChangeText={(t) => {
                        const n = t.trim() === '' ? null : parseInt(t, 10);
                        setStaffCount(isNaN(n as number) ? null : Math.max(0, n as number));
                      }}
                      keyboardType="number-pad"
                      placeholder="--"
                      placeholderTextColor={colors.textMuted}
                      editable={!isReadOnly}
                    />

                    {!isReadOnly && (
                      <TouchableOpacity
                        style={styles.stepBtnSmall}
                        onPress={() => handleStaffStep(1)}
                      >
                        <Ionicons name="add" size={16} color={colors.text} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Unit 2 Header with "+ Add Field" button */}
                <View style={styles.unitHeaderRow}>
                  <Text style={styles.unitSectionSubtitle}>
                    UNIT 2 &bull; {unit2Depts.length} DEPARTMENTS
                  </Text>
                  {!isReadOnly && (
                    <TouchableOpacity
                      style={[styles.addFieldHeaderBtn, { borderColor: '#E0E7FF' }]}
                      onPress={() => openAddModal('UNIT_2')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add-circle" size={16} color={colors.unit2} />
                      <Text style={[styles.addFieldHeaderBtnText, { color: colors.unit2 }]}>
                        Add Field
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {unit2Depts.map((dept) => {
                  const val = entries[dept.code];
                  const hasValue = val !== null && val !== undefined;

                  return (
                    <View key={dept.code} style={[styles.deptCard, hasValue && styles.deptCardEntered]}>
                      <View style={styles.deptCardLeft}>
                        <View style={[styles.orderCircle, { backgroundColor: '#EEF2FF' }]}>
                          <Text style={[styles.orderCircleText, { color: colors.unit2 }]}>
                            {dept.order}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.deptNameRow}>
                            <Text style={styles.deptCardName}>{dept.label}</Text>
                            {!isReadOnly && (
                              <TouchableOpacity
                                style={styles.editFieldIconBtn}
                                onPress={() => openEditModal(dept, 'UNIT_2')}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="pencil" size={12} color={colors.textSecondary} />
                              </TouchableOpacity>
                            )}
                          </View>
                          <Text style={styles.deptCardCode}>{dept.code}</Text>
                        </View>
                      </View>

                      <View style={styles.inputStepperRow}>
                        {!isReadOnly && (
                          <TouchableOpacity
                            style={styles.stepBtnSmall}
                            onPress={() => handleStepCount(dept.code, -1)}
                          >
                            <Ionicons name="remove" size={16} color={colors.text} />
                          </TouchableOpacity>
                        )}

                        <TextInput
                          style={[styles.deptCardInput, isReadOnly && styles.readOnlyInput]}
                          value={hasValue ? String(val) : ''}
                          onChangeText={(txt) => handleEntryChange(dept.code, txt)}
                          keyboardType="number-pad"
                          placeholder="--"
                          placeholderTextColor={colors.textMuted}
                          editable={!isReadOnly}
                        />

                        {!isReadOnly && (
                          <>
                            <TouchableOpacity
                              style={styles.stepBtnSmall}
                              onPress={() => handleStepCount(dept.code, 1)}
                            >
                              <Ionicons name="add" size={16} color={colors.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.stepBtnJump}
                              onPress={() => handleStepCount(dept.code, 5)}
                            >
                              <Text style={styles.stepBtnJumpText}>+5</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Dashed Add Field Card */}
                {!isReadOnly && (
                  <TouchableOpacity
                    style={[styles.addDashedCard, { borderColor: '#E0E7FF' }]}
                    onPress={() => openAddModal('UNIT_2')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.unit2} />
                    <Text style={[styles.addDashedCardText, { color: colors.unit2 }]}>
                      Add New Field to Unit 2
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Shift Adjustment Card */}
                <View style={[styles.deptCard, styles.adjustmentCard]}>
                  <View style={styles.deptCardLeft}>
                    <View style={[styles.orderCircle, { backgroundColor: '#F3E8FF' }]}>
                      <Ionicons name="time" size={13} color={colors.shift} />
                    </View>
                    <View>
                      <Text style={[styles.deptCardName, { color: colors.shift }]}>SHIFT (U2)</Text>
                      <Text style={styles.deptCardCode}>Shift Worker Adjustment</Text>
                    </View>
                  </View>

                  <View style={styles.inputStepperRow}>
                    {!isReadOnly && (
                      <TouchableOpacity
                        style={styles.stepBtnSmall}
                        onPress={() => handleShiftStep(-1)}
                      >
                        <Ionicons name="remove" size={16} color={colors.text} />
                      </TouchableOpacity>
                    )}

                    <TextInput
                      style={[
                        styles.deptCardInput,
                        styles.adjustmentInput,
                        isReadOnly && styles.readOnlyInput,
                      ]}
                      value={shiftCount !== null && shiftCount !== undefined ? String(shiftCount) : ''}
                      onChangeText={(t) => {
                        const n = t.trim() === '' ? null : parseInt(t, 10);
                        setShiftCount(isNaN(n as number) ? null : Math.max(0, n as number));
                      }}
                      keyboardType="number-pad"
                      placeholder="--"
                      placeholderTextColor={colors.textMuted}
                      editable={!isReadOnly}
                    />

                    {!isReadOnly && (
                      <TouchableOpacity
                        style={styles.stepBtnSmall}
                        onPress={() => handleShiftStep(1)}
                      >
                        <Ionicons name="add" size={16} color={colors.text} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* Dual Bottom Action Dock */}
        {!isReadOnly && (
          <View style={styles.actionDock}>
            <TouchableOpacity
              style={[styles.draftDockBtn, isSaving && styles.btnDisabled]}
              onPress={handleSaveDraft}
              disabled={isSaving || isSubmitting}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={17} color={colors.text} style={{ marginRight: 6 }} />
                  <Text style={styles.draftDockBtnText}>Save Draft</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitDockBtn, isSubmitting && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={isSaving || isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitDockBtnText}>Submit Report</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Add / Edit Department Field Modal with Live Duplicate Protection */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeptModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editingDept ? 'Edit Field' : `Add Field to ${modalUnit === 'UNIT_1' ? 'Unit 1' : 'Unit 2'}`}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {editingDept
                    ? `Update visible label for code: ${editingDept.code}`
                    : `Configure a new headcount field for ${modalUnit === 'UNIT_1' ? 'Unit 1' : 'Unit 2'}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeDeptModal}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputFieldLabel}>FIELD NAME / LABEL</Text>
              <TextInput
                style={[
                  styles.modalTextInput,
                  !duplicateValidation.isValid && deptInputLabel.trim().length > 0 && styles.modalTextInputError,
                  duplicateValidation.isValid && deptInputLabel.trim().length > 0 && styles.modalTextInputSuccess,
                ]}
                placeholder="e.g. SINGER, BUTTONING, PACKING"
                placeholderTextColor={colors.textMuted}
                value={deptInputLabel}
                onChangeText={setDeptInputLabel}
                autoFocus
                autoCapitalize="words"
              />

              {/* Duplicate Prevention Feedback Banner */}
              {!duplicateValidation.isValid && deptInputLabel.trim().length > 0 && (
                <View style={styles.modalDuplicateBanner}>
                  <Ionicons name="alert-circle" size={17} color="#DC2626" />
                  <Text style={styles.modalDuplicateText}>
                    {duplicateValidation.error}
                  </Text>
                </View>
              )}

              {/* Unique Name Valid Banner */}
              {duplicateValidation.isValid && deptInputLabel.trim().length > 0 && (
                <View style={styles.modalValidBanner}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                  <Text style={styles.modalValidText}>
                    Field name is unique & valid for {modalUnit === 'UNIT_1' ? 'Unit 1' : 'Unit 2'}.
                  </Text>
                </View>
              )}

              <Text style={styles.modalHelperNote}>
                &bull; Duplicate fields with the same name are strictly prohibited in the same unit.
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={closeDeptModal}
                disabled={isSubmittingDept}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  (!duplicateValidation.isValid || !deptInputLabel.trim() || isSubmittingDept) &&
                    styles.modalSaveBtnDisabled,
                ]}
                onPress={handleSaveDepartment}
                disabled={!duplicateValidation.isValid || !deptInputLabel.trim() || isSubmittingDept}
                activeOpacity={0.85}
              >
                {isSubmittingDept ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons
                      name={editingDept ? 'checkmark' : 'add'}
                      size={17}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.modalSaveBtnText}>
                      {editingDept ? 'Save Changes' : 'Add Field'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  stickyHud: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  hudLeft: {
    flex: 1,
  },
  hudSubRow: {
    marginBottom: 6,
  },
  hudFormulaText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  hudFormulaVal: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    width: 100,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    color: '#7DD3FC',
    fontWeight: '700',
  },
  hudRight: {
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  hudGrandNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: -1,
    lineHeight: 38,
  },
  hudGrandLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  dateSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  dateInfoCol: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  dateDisplay: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  dateNavPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  todayPill: {
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  todayPillActive: {
    backgroundColor: colors.primaryNavy,
    borderColor: colors.primaryNavy,
  },
  todayPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  todayPillTextActive: {
    color: '#ffffff',
  },
  speedHelpersBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  speedHelperBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    paddingVertical: 7,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  speedHelperText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryAccent,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  statusApproved: {
    backgroundColor: colors.approvedBg,
    borderWidth: 1,
    borderColor: colors.approvedBorder,
  },
  statusSubmitted: {
    backgroundColor: colors.submittedBg,
    borderWidth: 1,
    borderColor: colors.submittedBorder,
  },
  statusBannerText: {
    fontSize: 12,
    color: colors.text,
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  toastBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.synced,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.conflict,
  },
  errorText: {
    fontSize: 11,
    color: colors.conflict,
    marginTop: 2,
  },
  errorMore: {
    fontSize: 11,
    color: colors.conflict,
    fontWeight: '700',
    marginTop: 4,
  },
  unitTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  unitTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  unitTabActiveU1: {
    backgroundColor: '#FFFFFF',
    shadowColor: colors.unit1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  unitTabActiveU2: {
    backgroundColor: '#FFFFFF',
    shadowColor: colors.unit2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  unitTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  unitTabTextActiveU1: {
    color: colors.unit1,
    fontWeight: '900',
  },
  unitTabTextActiveU2: {
    color: colors.unit2,
    fontWeight: '900',
  },
  unitHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitSectionSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  addFieldHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  addFieldHeaderBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.unit1,
  },
  cardsList: {
    gap: 8,
    marginBottom: 20,
  },
  deptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  deptCardEntered: {
    borderColor: '#BAE6FD',
    backgroundColor: '#F8FAFC',
  },
  deptCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  deptNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editFieldIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCircleText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  deptCardName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  deptCardCode: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  inputStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtnSmall: {
    width: 32,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepBtnJump: {
    paddingHorizontal: 8,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  stepBtnJumpText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryAccent,
  },
  deptCardInput: {
    width: 68,
    height: 38,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
  },
  addDashedCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addDashedCardText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.unit1,
  },
  adjustmentCard: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    marginTop: 6,
  },
  adjustmentInput: {
    borderColor: '#C084FC',
  },
  readOnlyInput: {
    backgroundColor: '#E2E8F0',
    color: '#64748B',
  },
  actionDock: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  draftDockBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftDockBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  submitDockBtn: {
    flex: 1.2,
    height: 48,
    backgroundColor: colors.primaryAccent,
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
  submitDockBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    fontWeight: '500',
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalBody: {
    marginBottom: 20,
  },
  inputFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  modalTextInput: {
    height: 46,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: '#F8FAFC',
  },
  modalTextInputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  modalTextInputSuccess: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  modalDuplicateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 10,
  },
  modalDuplicateText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
    flex: 1,
  },
  modalValidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 10,
  },
  modalValidText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
    flex: 1,
  },
  modalHelperNote: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 10,
    lineHeight: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalSaveBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primaryAccent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryAccent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  modalSaveBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
