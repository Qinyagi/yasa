import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  getCurrentSpaceId,
  getAllShiftPlans,
  getShiftPlanFromMapForSpace,
  todayISO,
  isValidISODate,
} from '../../lib/storage';
import { colors } from '../../constants/theme';
import { MultiavatarView } from '../../components/MultiavatarView';
import { resolveAvatarSeed } from '../../lib/avatarSeed';
import type { UserProfile, Space, MemberSnapshot, ShiftType } from '../../types';

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatGerman(dateISO: string): string {
  const [y, m, d] = dateISO.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateEntry {
  member: MemberSnapshot;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CandidatesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dateISO?: string;
    returnTo?: string;
    returnDate?: string;
    returnMonthKey?: string;
  }>();

  const dateISO = params.dateISO ?? todayISO();
  const returnTo = params.returnTo;
  const returnDate = params.returnDate;
  const returnMonthKey = params.returnMonthKey;
  const backLabel = returnTo === '/(services)' ? '← Zurück zu Services' : '← Zurück zum Kalender';

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  // A1-02: Membership guard – default true um Flash zu vermeiden
  const [isMember, setIsMember] = useState(true);
  const [candidates, setCandidates] = useState<CandidateEntry[]>([]);
  const [membersWithoutPlan, setMembersWithoutPlan] = useState(0);
  const [myShift, setMyShift] = useState<ShiftType | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateError, setDateError] = useState(false);
  const navigatingBackRef = useRef(false);

  const handleBack = useCallback(() => {
    if (navigatingBackRef.current) return;
    navigatingBackRef.current = true;
    if (returnTo) {
      const params: {
        dateISO?: string;
        returnMonthKey?: string;
        suppressTaModal?: string;
        returnToken?: string;
      } = {};
      if (returnDate) params.dateISO = returnDate;
      if (returnMonthKey) params.returnMonthKey = returnMonthKey;
      if (returnTo === '/(shift)/calendar') params.suppressTaModal = '1';
      params.returnToken = String(Date.now());
      router.replace({ pathname: returnTo, params });
    } else {
      // Fallback: sicherer Zielscreen
      router.replace('/(swap)');
    }
    setTimeout(() => {
      navigatingBackRef.current = false;
    }, 400);
  }, [returnTo, returnDate, returnMonthKey, router]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      async function load() {
        // Datum validieren
        if (!isValidISODate(dateISO)) {
          if (active) { setDateError(true); setLoading(false); }
          return;
        }

        const [p, currentSpaceId, allPlans] = await Promise.all([
          getProfile(),
          getCurrentSpaceId(),
          getAllShiftPlans(),
        ]);

        if (!active) return;
        setProfile(p);

        if (!p || !currentSpaceId) {
          if (active) { setSpace(null); setLoading(false); }
          return;
        }

        const spaces = await getSpaces();
        const activeSpace = spaces.find((s) => s.id === currentSpaceId) ?? null;
        if (!active) return;
        setSpace(activeSpace);

        if (!activeSpace) {
          if (active) setLoading(false);
          return;
        }

        // A1-02: Membership guard
        const memberOk = activeSpace.memberProfiles.some((m) => m.id === p.id);
        if (!memberOk) {
          if (active) { setIsMember(false); setLoading(false); }
          return;
        }

        // Eigene Schicht am gewählten Tag
        const myPlan = getShiftPlanFromMapForSpace(allPlans, currentSpaceId, p.id);
        const myEntry = myPlan?.entries.find((e) => e.dateISO === dateISO);
        if (active) setMyShift(myEntry?.code ?? null);

        // Kandidaten berechnen: alle anderen Mitglieder die an dateISO "O" haben
        const result: CandidateEntry[] = [];
        let withoutPlan = 0;

        for (const member of activeSpace.memberProfiles) {
          if (member.id === p.id) continue; // eigenes Profil überspringen

          const memberPlan = getShiftPlanFromMapForSpace(allPlans, currentSpaceId, member.id);
          if (!memberPlan) {
            withoutPlan++;
            continue;
          }

          const memberEntry = memberPlan.entries.find((e) => e.dateISO === dateISO);
          if (!memberEntry) {
            withoutPlan++;
            continue;
          }

          // Frei = R (Ruhe), U (Urlaub), X (Platzhalter/Frei)
          if (memberEntry.code === 'R' || memberEntry.code === 'X' || memberEntry.code === 'U') {
            result.push({ member });
          }
        }

        if (active) {
          setCandidates(result);
          setMembersWithoutPlan(withoutPlan);
          setLoading(false);
        }
      }

      load();
      return () => { active = false; };
    }, [dateISO])
  );

  // Android Hardware-Back soll denselben Return-Point nutzen wie der Button.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  // ── Fehler: ungültiges Datum ──────────────────────────────────────────────

  if (dateError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorTitle}>Ungültiges Datum</Text>
        <Text style={styles.errorDesc}>Das übergebene Datum ist ungültig.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(swap)')}>
          <Text style={styles.btnText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Laden ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Guard: kein Profil ───────────────────────────────────────────────────

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>👤</Text>
        <Text style={styles.errorTitle}>Profil benötigt</Text>
        <Text style={styles.errorDesc}>
          Du brauchst ein Profil, um Swap-Kandidaten zu sehen.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(auth)/create-profile')}>
          <Text style={styles.btnText}>Profil erstellen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Guard: kein Space aktiv ─────────────────────────────────────────────

  if (!space) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>🏠</Text>
        <Text style={styles.errorTitle}>Kein Space aktiv</Text>
        <Text style={styles.errorDesc}>
          Öffne einen Space, bevor du Swap-Kandidaten suchst.
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
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorTitle}>Kein Mitglied</Text>
        <Text style={styles.errorDesc}>
          Du bist kein Mitglied im aktiven Space „{space.name}".
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.btnText}>Space wechseln</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formattedDate = formatGerman(dateISO);
  const isToday = dateISO === todayISO();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <Text style={styles.title}>Swap-Kandidaten</Text>
      <Text style={styles.dateLabel}>{formattedDate}</Text>
      <Text style={styles.spaceHint}>
        Space: <Text style={styles.spaceName}>{space.name}</Text>
      </Text>

      {/* ── Meine Schicht am gewählten Tag ────────────────────────── */}
      <View style={styles.myShiftBox}>
        <MultiavatarView
          seed={resolveAvatarSeed(profile.id, profile.displayName, profile.avatarUrl)}
          size={40}
        />
        <View style={styles.myShiftText}>
          <Text style={styles.myShiftName}>{profile.displayName} (du)</Text>
          {myShift ? (
            <View style={styles.myShiftBadgeRow}>
              <View style={[styles.badge, shiftBadgeStyle(myShift)]}>
                <Text style={[styles.badgeText, shiftTextStyle(myShift)]}>{myShift}</Text>
              </View>
              <Text style={styles.myShiftDesc}>{shiftLabel(myShift)}</Text>
            </View>
          ) : (
            <Text style={styles.noShiftHint}>Kein Plan für diesen Tag</Text>
          )}
        </View>
      </View>

      {/* ── Info-Box: Kandidaten-Erklärung ────────────────────────── */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          💡 Gezeigt werden Kollegen, die am {isToday ? 'heutigen Tag' : 'gewählten Tag'} <Text style={styles.infoBold}>frei</Text> (R/U/X) haben – also potenzielle Swap-Partner.
        </Text>
      </View>

      {/* ── Kandidaten-Liste ──────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>
        {candidates.length > 0
          ? `${candidates.length} Kandidat${candidates.length === 1 ? '' : 'en'} verfügbar`
          : 'Keine Kandidaten'}
      </Text>

      {candidates.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>😴</Text>
          <Text style={styles.emptyTitle}>Heute ist niemand im Team frei.</Text>
          <Text style={styles.emptyDesc}>
            Kein Mitglied hat an diesem Tag den Status Ruhe/Urlaub/Frei.
          </Text>
        </View>
      ) : (
        candidates.map(({ member }) => (
          <View key={member.id} style={styles.candidateRow}>
            <MultiavatarView
              seed={resolveAvatarSeed(member.id, member.displayName, member.avatarUrl)}
              size={42}
            />
            <Text style={styles.candidateName}>{member.displayName}</Text>
            <View style={[styles.badge, styles.badgeFree]}>
              <Text style={[styles.badgeText, styles.badgeTextFree]}>Frei</Text>
            </View>
          </View>
        ))
      )}

      {/* ── Hinweis: Mitglieder ohne Plan ─────────────────────────── */}
      {membersWithoutPlan > 0 && (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            ℹ️ {membersWithoutPlan} Mitglied{membersWithoutPlan > 1 ? 'er haben' : ' hat'} noch keinen Dienstplan – sie werden hier nicht angezeigt.
          </Text>
        </View>
      )}

      {/* ── Navigation ────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
        <Text style={styles.backBtnText}>{backLabel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Shift-Hilfs-Funktionen ───────────────────────────────────────────────────

function shiftLabel(code: ShiftType): string {
  const map: Record<ShiftType, string> = {
    F: 'Frühschicht',
    S: 'Spätschicht',
    N: 'Nachtschicht',
    T: 'Tagesdienst',
    KS: 'Kurzer Spätdienst',
    KN: 'Kurzer Nachtdienst',
    K: 'Krank',
    EK: 'entschuldigt Krank',
    R: 'Ruhe',
    U: 'Urlaub',
    X: 'Frei',
  };
  return map[code];
}

function shiftBadgeStyle(code: ShiftType): object {
  const map: Record<ShiftType, object> = {
    F: { backgroundColor: '#FEF3C7' },
    S: { backgroundColor: '#DBEAFE' },
    N: { backgroundColor: '#EDE9FE' },
    T: { backgroundColor: '#FFF7ED' },
    KS: { backgroundColor: '#FFE4E6' },
    KN: { backgroundColor: '#E0E7FF' },
    K: { backgroundColor: '#FEE2E2' },
    EK: { backgroundColor: '#FFEDD5' },
    R: { backgroundColor: '#F3F4F6' },
    U: { backgroundColor: '#ECFDF5' },
    X: { backgroundColor: '#F5F5F4' },
  };
  return map[code];
}

function shiftTextStyle(code: ShiftType): object {
  const map: Record<ShiftType, object> = {
    F: { color: '#92400E' },
    S: { color: '#1D4ED8' },
    N: { color: '#5B21B6' },
    T: { color: '#C2410C' },
    KS: { color: '#BE123C' },
    KN: { color: '#3730A3' },
    K: { color: '#B91C1C' },
    EK: { color: '#C2410C' },
    R: { color: '#6B7280' },
    U: { color: '#059669' },
    X: { color: '#78716C' },
  };
  return map[code];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  // Header
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  spaceHint: {
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: 20,
  },
  spaceName: {
    color: colors.secondaryDark,
    fontWeight: '600',
  },
  // Eigene Schicht
  myShiftBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
    marginBottom: 16,
    gap: 14,
  },
  myShiftText: {
    flex: 1,
  },
  myShiftName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  myShiftBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  myShiftDesc: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  noShiftHint: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  // Info-Box
  infoBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  infoBold: {
    fontWeight: '700',
  },
  // Section Label
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  // Kandidaten-Zeile
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.successLight,
    gap: 12,
  },
  candidateName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // Badges
  badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeFree: {
    backgroundColor: '#DCFCE7',
  },
  badgeTextFree: {
    color: colors.successDark,
  },
  // Empty State
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.secondaryDark,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Hint Box
  hintBox: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
  },
  hintText: {
    fontSize: 13,
    color: colors.secondaryDark,
    lineHeight: 18,
  },
  // Error State
  errorEmoji: {
    fontSize: 48,
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  // Buttons
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  btnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '600',
  },
  backBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 24,
    backgroundColor: colors.backgroundTertiary,
  },
  backBtnText: {
    color: colors.secondaryDark,
    fontSize: 15,
    fontWeight: '600',
  },
});
