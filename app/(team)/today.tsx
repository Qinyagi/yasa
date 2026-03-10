import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  getCurrentSpaceId,
  getAllShiftPlans,
  todayISO,
  listGhosts,
  markGhostPresent,
} from '../../lib/storage';
import { diffDaysUTC, shiftCodeAtDate } from '../../lib/shiftEngine';
import { MultiavatarView } from '../../components/MultiavatarView';
import type { UserProfile, Space, ShiftType, MemberSnapshot } from '../../types';
import { colors, typography, spacing, borderRadius, accessibility, SHIFT_META, SHIFT_SEQUENCE } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColleagueEntry {
  member: MemberSnapshot;
  code: ShiftType;
  isGhost?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  // A1-02: Membership guard – default true um Flash zu vermeiden
  const [isMember, setIsMember] = useState(true);
  const [myShift, setMyShift] = useState<ShiftType | null>(null);
  const [colleagues, setColleagues] = useState<ColleagueEntry[]>([]);
  const [ghostsPresent, setGhostsPresent] = useState<ColleagueEntry[]>([]);
  const [noPlansCount, setNoPlansCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Ghost Modal State
  const [showGhostModal, setShowGhostModal] = useState(false);
  const [availableGhosts, setAvailableGhosts] = useState<UserProfile[]>([]);
  const [selectedGhost, setSelectedGhost] = useState<UserProfile | null>(null);
  const [selectedShiftCode, setSelectedShiftCode] = useState<ShiftType | null>(null);
  const [savingGhost, setSavingGhost] = useState(false);

  const loadData = useCallback(async () => {
    const [p, currentSpaceId, allPlans] = await Promise.all([
      getProfile(),
      getCurrentSpaceId(),
      getAllShiftPlans(),
    ]);

    setProfile(p);

    if (!p || !currentSpaceId) {
      setSpace(null);
      setMyShift(null);
      setColleagues([]);
      setGhostsPresent([]);
      setLoading(false);
      return;
    }

    const spaces = await getSpaces();
    const activeSpace = spaces.find((s) => s.id === currentSpaceId) ?? null;
    setSpace(activeSpace);

    if (!activeSpace) {
      setMyShift(null);
      setColleagues([]);
      setGhostsPresent([]);
      setLoading(false);
      return;
    }

    // A1-02: Membership guard – Profil muss Mitglied im currentSpace sein
    const memberOk = activeSpace.memberProfiles.some((m) => m.id === p.id);
    setIsMember(memberOk);
    if (!memberOk) {
      setMyShift(null);
      setColleagues([]);
      setGhostsPresent([]);
      setLoading(false);
      return;
    }

    const today = todayISO();

    // Eigene heutige Schicht ermitteln
    const myPlan = allPlans[p.id];
    const myEntry = myPlan?.entries.find((e) => e.dateISO === today);
    const myCode = myEntry?.code ?? null;
    setMyShift(myCode);

    // ── DEV Debug: Datum-Mapping für Today ──────────────────────────────
    if (__DEV__ && myPlan) {
      const cycleLen = myPlan.cycleLengthDays || myPlan.pattern.length;
      const diff     = diffDaysUTC(myPlan.startDateISO, today);
      const patIdx   = diff >= 0 ? diff % cycleLen : -1;
      console.log('[YASA Debug] Today:', {
        startDate:    myPlan.startDateISO,
        cycleLength:  cycleLen,
        today,
        diffDays:     diff,
        patternIndex: patIdx,
        shift:        shiftCodeAtDate(myPlan.startDateISO, myPlan.pattern, today),
      });
    }
    // ────────────────────────────────────────────────────────────────────

    // Alle anderen Mitglieder durchgehen
    const result: ColleagueEntry[] = [];
    let withoutPlan = 0;

    for (const member of activeSpace.memberProfiles) {
      if (member.id === p.id) continue;

      const memberPlan = allPlans[member.id];
      if (!memberPlan) {
        withoutPlan++;
        continue;
      }

      const memberEntry = memberPlan.entries.find((e) => e.dateISO === today);
      if (!memberEntry) {
        withoutPlan++;
        continue;
      }

      // Nur anzeigen wenn gleiche Schicht wie User
      if (myCode !== null && memberEntry.code === myCode) {
        result.push({ member, code: memberEntry.code });
      }
    }

    setColleagues(result);
    setNoPlansCount(withoutPlan);

    // Ghosts laden und prüfen welche heute einen Eintrag haben
    const ghosts = await listGhosts(currentSpaceId);
    setAvailableGhosts(ghosts);

    const ghostEntries: ColleagueEntry[] = [];
    for (const ghost of ghosts) {
      const ghostPlan = allPlans[ghost.id];
      if (!ghostPlan) continue;
      const ghostEntry = ghostPlan.entries.find((e) => e.dateISO === today);
      if (ghostEntry) {
        ghostEntries.push({
          member: {
            id: ghost.id,
            displayName: ghost.ghostLabel ?? ghost.displayName,
            avatarUrl: ghost.avatarUrl,
          },
          code: ghostEntry.code,
          isGhost: true,
        });
      }
    }
    setGhostsPresent(ghostEntries);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadData().then(() => {
        // loadData sets loading=false internally; guard against unmount race
        if (!active) return;
      });
      return () => { active = false; };
    }, [loadData])
  );

  // ── Ghost Presence Handler ────────────────────────────────────────────────────

  function handleOpenGhostModal() {
    setSelectedGhost(null);
    setSelectedShiftCode(null);
    setShowGhostModal(true);
  }

  async function handleConfirmGhostPresence() {
    if (!selectedGhost || !selectedShiftCode || !space) return;
    setSavingGhost(true);
    try {
      const today = todayISO();
      await markGhostPresent(selectedGhost.id, today, selectedShiftCode);

      // Optimistisches UI Update
      setGhostsPresent((prev) => {
        // Entferne existierenden Eintrag für diesen Ghost (falls Update)
        const filtered = prev.filter((g) => g.member.id !== selectedGhost.id);
        return [
          ...filtered,
          {
            member: {
              id: selectedGhost.id,
              displayName: selectedGhost.ghostLabel ?? selectedGhost.displayName,
              avatarUrl: selectedGhost.avatarUrl,
            },
            code: selectedShiftCode,
            isGhost: true,
          },
        ];
      });

      setShowGhostModal(false);
      setSelectedGhost(null);
      setSelectedShiftCode(null);
    } catch {
      // Fehler still abfangen
    } finally {
      setSavingGhost(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // ── Guard: kein Profil ───────────────────────────────────────────────────
  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>👤</Text>
        <Text style={styles.emptyTitle}>Profil benötigt</Text>
        <Text style={styles.emptyDesc}>
          Du brauchst ein Profil, um Kollegen zu sehen.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(auth)/create-profile')}>
          <Text style={styles.btnText}>Profil erstellen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.backBtn, { marginTop: 12 }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Guard: kein Space aktiv ─────────────────────────────────────────────
  if (!space) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>👥</Text>
        <Text style={styles.emptyTitle}>Kein Space aktiv</Text>
        <Text style={styles.emptyDesc}>
          Tritt einem Space bei oder erstelle einen, um Kollegen zu sehen.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.btnText}>Space wählen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Guard: kein Mitglied im currentSpace (A1-02) ──────────────────────
  if (!isMember) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>⚠️</Text>
        <Text style={styles.emptyTitle}>Kein Mitglied</Text>
        <Text style={styles.emptyDesc}>
          Du bist kein Mitglied im aktiven Space „{space.name}".
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.btnText}>Space wechseln</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const today = todayISO();
  const [y, m, d] = today.split('-');
  const todayFormatted = `${d}.${m}.${y}`;
  const myMeta = myShift ? SHIFT_META[myShift] : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mit wem arbeite ich heute?</Text>
      <Text style={styles.dateText}>{todayFormatted}</Text>
      <Text style={styles.spaceHint}>Space: <Text style={styles.spaceName}>{space.name}</Text></Text>

      {/* ── Meine Schicht ──────────────────────────────────────────── */}
      <View style={styles.myShiftBox}>
        <MultiavatarView uri={profile.avatarUrl} size={44} />
        <View style={styles.myShiftText}>
          <Text style={styles.myShiftName}>{profile.displayName} (du)</Text>
          {myShift && myMeta ? (
            <View style={styles.myShiftBadgeRow}>
              <View style={[styles.shiftBadge, { backgroundColor: myMeta.bg }]}>
                <Text style={[styles.shiftCode, { color: myMeta.fg }]}>{myMeta.label}</Text>
              </View>
              <Text style={[styles.shiftDesc, { color: myMeta.fg }]}>{myMeta.desc}</Text>
            </View>
          ) : (
            <Text style={styles.noShiftHint}>Kein Schichtplan hinterlegt</Text>
          )}
        </View>
      </View>

      {/* ── Kein eigener Plan ──────────────────────────────────────── */}
      {!myShift && (
        <View style={styles.noOwnPlanBox}>
          <Text style={styles.noOwnPlanText}>
            Du hast noch keinen Schichtplan. Richte ihn ein, um Kollegen mit gleicher Schicht zu sehen.
          </Text>
          <TouchableOpacity
            style={styles.setupBtn}
            onPress={() => router.push('/(shift)/setup')}
          >
            <Text style={styles.setupBtnText}>Dienstplan einrichten</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Gleiche Schicht ────────────────────────────────────────── */}
      {myShift && (
        <>
          <Text style={styles.sectionLabel}>
            {colleagues.length > 0
              ? `${colleagues.length} Kolleg${colleagues.length === 1 ? 'e' : 'en'} in deiner Schicht`
              : 'Niemand in deiner Schicht'}
          </Text>

          {colleagues.length === 0 ? (
            <View style={styles.emptyColleagueBox}>
              <Text style={styles.emptyColleagueEmoji}>😴</Text>
              <Text style={styles.emptyColleagueText}>
                Keine Kollegen mit gleicher Schicht heute.
              </Text>
            </View>
          ) : (
            colleagues.map(({ member, code }) => {
              const meta = SHIFT_META[code];
              return (
                <View key={member.id} style={styles.colleagueRow}>
                  <MultiavatarView uri={member.avatarUrl} size={40} />
                  <Text style={styles.colleagueName}>{member.displayName}</Text>
                  <View style={[styles.shiftBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.shiftCode, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </View>
              );
            })
          )}

          {/* Hinweis: Teamdaten lokal unvollständig */}
          {noPlansCount > 0 && (
            <View style={styles.noPlansHintBox}>
              <Text style={styles.noPlansHintText}>
                ℹ️ Auf diesem Gerät liegen noch nicht alle Team-Dienstpläne vor.
              </Text>
            </View>
          )}
        </>
      )}

      {/* ── Alle Mitglieder-Pläne fehlen (lokal) ────────────────────────── */}
      {myShift && colleagues.length === 0 && noPlansCount === space.memberProfiles.length - 1 && (
        <View style={styles.noTeamPlansBox}>
          <Text style={styles.noTeamPlansText}>
            Auf diesem Gerät liegen noch keine Team-Dienstpläne vor. Synchronisiere die Daten, um Kollegen zu sehen.
          </Text>
        </View>
      )}

      {/* ── Ghost-Einträge heute ──────────────────────────────────── */}
      {ghostsPresent.length > 0 && (
        <View style={styles.ghostPresentSection}>
          <Text style={styles.sectionLabel}>
            Ghosts heute ({ghostsPresent.length})
          </Text>
          {ghostsPresent.map(({ member, code }) => {
            const meta = SHIFT_META[code];
            return (
              <View key={member.id} style={styles.ghostRow}>
                <MultiavatarView seed={member.avatarUrl} size={40} />
                <View style={styles.ghostNameCol}>
                  <Text style={styles.colleagueName}>{member.displayName}</Text>
                  <Text style={styles.ghostTag}>Ghost</Text>
                </View>
                <View style={[styles.shiftBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.shiftCode, { color: meta.fg }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Ghost als anwesend markieren Button ──────────────────── */}
      {availableGhosts.length > 0 && (
        <TouchableOpacity
          style={styles.ghostMarkBtn}
          onPress={handleOpenGhostModal}
        >
          <Text style={styles.ghostMarkBtnText}>👻 Ghost als anwesend markieren</Text>
        </TouchableOpacity>
      )}

      {/* ── Ghost Presence Modal ─────────────────────────────────── */}
      <Modal
        visible={showGhostModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGhostModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ghost markieren</Text>

            {/* Schritt 1: Ghost auswählen */}
            <Text style={styles.modalStepLabel}>1. Ghost auswählen</Text>
            <ScrollView style={styles.ghostPickerScroll} nestedScrollEnabled>
              {availableGhosts.map((ghost) => {
                const isSelected = selectedGhost?.id === ghost.id;
                const seed = ghost.avatarUrl || `${space.id}:${ghost.ghostLabel}`.toLowerCase();
                return (
                  <TouchableOpacity
                    key={ghost.id}
                    style={[styles.ghostPickerItem, isSelected && styles.ghostPickerItemActive]}
                    onPress={() => setSelectedGhost(ghost)}
                  >
                    <MultiavatarView seed={seed} size={32} />
                    <Text style={[styles.ghostPickerName, isSelected && styles.ghostPickerNameActive]}>
                      {ghost.ghostLabel ?? ghost.displayName}
                    </Text>
                    {isSelected && <Text style={styles.ghostPickerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Schritt 2: Schicht-Code wählen */}
            {selectedGhost && (
              <>
                <Text style={styles.modalStepLabel}>2. Schicht wählen</Text>
                <View style={styles.shiftPicker}>
                  {SHIFT_SEQUENCE.map((code) => {
                    const meta = SHIFT_META[code];
                    const isSelected = selectedShiftCode === code;
                    return (
                      <TouchableOpacity
                        key={code}
                        style={[
                          styles.shiftPickerItem,
                          { backgroundColor: meta.bg },
                          isSelected && styles.shiftPickerItemActive,
                        ]}
                        onPress={() => setSelectedShiftCode(code)}
                      >
                        <Text style={[styles.shiftPickerCode, { color: meta.fg }]}>{meta.label}</Text>
                        <Text style={[styles.shiftPickerDesc, { color: meta.fg }]}>{meta.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowGhostModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  (!selectedGhost || !selectedShiftCode || savingGhost) && styles.modalConfirmBtnDisabled,
                ]}
                onPress={handleConfirmGhostPresence}
                disabled={!selectedGhost || !selectedShiftCode || savingGhost}
              >
                {savingGhost ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Bestätigen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.calendarBtn}
        onPress={() => router.push('/(shift)/calendar')}
      >
        <Text style={styles.calendarBtnText}>Mein Kalender</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.swapBtn}
        onPress={() => router.push('/(swap)/index')}
      >
        <Text style={styles.swapBtnText}>🔄 Dienst tauschen</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace('/(space)/choose')}
      >
        <Text style={styles.backBtnText}>Zurück zu Spaces</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  dateText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  spaceHint: {
    fontSize: typography.fontSize.sm - 2,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  spaceName: {
    color: colors.grayDark,
    fontWeight: typography.fontWeight.semibold,
  },
  // Eigene Schicht-Box
  myShiftBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBackground,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  myShiftText: {
    flex: 1,
  },
  myShiftName: {
    fontSize: typography.fontSize.sm + 1,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  myShiftBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noShiftHint: {
    fontSize: typography.fontSize.sm - 1,
    color: colors.textTertiary,
  },
  // Kein eigener Plan
  noOwnPlanBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 24,
  },
  noOwnPlanText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    marginBottom: 12,
  },
  setupBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  setupBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  // Section Label
  sectionLabel: {
    fontSize: typography.fontSize.sm - 1,
    fontWeight: typography.fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  // Kollegen-Zeile
  colleagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.lg,
    padding: spacing.md - 4,
    marginBottom: spacing.sm,
    gap: spacing.md - 4,
  },
  colleagueName: {
    flex: 1,
    fontSize: typography.fontSize.sm + 1,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  shiftBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftCode: {
    fontSize: 15,
    fontWeight: '800',
  },
  shiftDesc: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Keine Kollegen
  emptyColleagueBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyColleagueEmoji: {
    fontSize: 40,
    marginBottom: spacing.sm + 2,
  },
  emptyColleagueText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Kein Plan Hinweis
  noPlansHintBox: {
    backgroundColor: '#F0F4FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#C7D7FD',
  },
  noPlansHintText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  // Team ohne Pläne
  noTeamPlansBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  noTeamPlansText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
    textAlign: 'center',
  },
  // Ghost Present Section
  ghostPresentSection: {
    marginTop: 20,
  },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  ghostNameCol: {
    flex: 1,
  },
  ghostTag: {
    fontSize: typography.fontSize.xs + -1,
    color: colors.purple,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 2,
  },
  // Ghost Mark Button
  ghostMarkBtn: {
    borderWidth: 1,
    borderColor: colors.purple,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md - 1,
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.purpleLight + '20',
  },
  ghostMarkBtnText: {
    color: colors.purple,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  modalStepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  ghostPickerScroll: {
    maxHeight: 160,
    marginBottom: 16,
  },
  ghostPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
    gap: 10,
    backgroundColor: '#F9FAFB',
  },
  ghostPickerItemActive: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  ghostPickerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  ghostPickerNameActive: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  ghostPickerCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7C3AED',
  },
  // Shift Picker
  shiftPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  shiftPickerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 70,
  },
  shiftPickerItemActive: {
    borderWidth: 2,
    borderColor: '#111',
  },
  shiftPickerCode: {
    fontSize: 16,
    fontWeight: '800',
  },
  shiftPickerDesc: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  modalCancelBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.purple,
  },
  modalConfirmBtnDisabled: {
    opacity: 0.5,
  },
  modalConfirmBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Empty States
  emptyEmoji: {
    fontSize: 52,
    marginBottom: spacing.md + 2,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg + 2,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  btnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base - 1,
    fontWeight: typography.fontWeight.semibold,
  },
  // Navigation Buttons
  calendarBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md - 2,
    backgroundColor: colors.primaryBackground,
  },
  calendarBtnText: {
    color: colors.primary,
    fontSize: typography.fontSize.base - 1,
    fontWeight: typography.fontWeight.semibold,
  },
  swapBtn: {
    borderWidth: 1,
    borderColor: colors.purple,
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: spacing.md - 2,
    backgroundColor: colors.purpleLight + '20',
  },
  swapBtnText: {
    color: colors.purple,
    fontSize: typography.fontSize.base - 1,
    fontWeight: typography.fontWeight.semibold,
  },
  backBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base - 1,
    fontWeight: typography.fontWeight.semibold,
  },
});
