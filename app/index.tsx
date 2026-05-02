import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  buildSpaceProfileKey,
  getShiftPlanForSpace,
  getShiftForDateForSpace,
  getCurrentSpaceId,
  getOpenSwapRequests,
  getTimeClockConfigOrDefault,
  getTimeClockEvents,
  addTimeClockEvent,
  clearTimeClockTestPrompt,
  deriveTimeClockStampState,
  getTimeClockTestPrompt,
  shiftLabelForStamp,
  todayISO,
  formatDateISO,
  getOpenShortShiftVacationReminders,
  confirmShortShiftVacationReminder,
  snoozeShortShiftVacationReminder,
  getSpaceStatusEvents,
  upsertSpaceStatusEvents,
  getSeenSpaceStatusEventIds,
  markSpaceStatusEventSeen,
  type ShortShiftVacationReminder,
} from '../lib/storage';
import { pullSpaceStatusEvents } from '../lib/backend/spaceStatusSync';
import { isShiftpalRelevantStatusEvent } from '../lib/spaceStatusRelevance';
import { MultiavatarView } from '../components/MultiavatarView';
import type { RegularShiftCode, ShiftType, TimeClockEventType, UserProfile } from '../types';
import type { SpaceStatusEvent } from '../types/spaceStatus';
import { typography, spacing, borderRadius, shadows, warmHuman } from '../constants/theme';
import { logInfo } from '../lib/log';
import { Button } from '../components/Button';
import { autoStampMissedShifts } from '../lib/autoStamp';

const REGULAR_SHIFT_CODES: RegularShiftCode[] = ['F', 'S', 'N', 'KS', 'KN', 'T'];

interface StampPrompt {
  key: string;
  shiftDateISO: string;
  shiftCode: RegularShiftCode;
  eventType: TimeClockEventType;
  source: 'window' | 'test';
}

function isRegularShiftCode(code: ShiftType | null): code is RegularShiftCode {
  return !!code && REGULAR_SHIFT_CODES.includes(code as RegularShiftCode);
}

function weekdayLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'long' });
}

function parseHHMM(input: string): number {
  const [h, m] = input.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

function toDateFromISOAndTime(dateISO: string, hhmm: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const minutes = parseHHMM(hhmm);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function plusDays(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

function diffDays(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = new Date(ay, am - 1, ad).getTime();
  const b = new Date(by, bm - 1, bd).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

export default function StartScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasSpaces, setHasSpaces] = useState(false);
  const [hasShiftPlan, setHasShiftPlan] = useState(false);
  const [openSwapCount, setOpenSwapCount] = useState(0);
  const [stampPrompt, setStampPrompt] = useState<StampPrompt | null>(null);
  const [shortShiftReminder, setShortShiftReminder] = useState<ShortShiftVacationReminder | null>(null);
  const [spaceStatusPrompt, setSpaceStatusPrompt] = useState<SpaceStatusEvent | null>(null);
  const completedPromptKeysRef = useRef<Set<string>>(new Set());
  // Bewusst in-memory: "Spaeter" gilt nur bis zum naechsten App-Restart.
  const [dismissedPromptKey, setDismissedPromptKey] = useState<string | null>(null);
  const [missedStampCount, setMissedStampCount] = useState(0);
  // P0 (2026-04-11): autoStamp-Fehler sichtbar halten, bis die nächste
  // erfolgreiche Ausführung den State zurücksetzt. Kein stilles Swallowing.
  const [autoStampError, setAutoStampError] = useState<string | null>(null);
  const [stamping, setStamping] = useState(false);
  const [confirmingShortShiftReminder, setConfirmingShortShiftReminder] = useState(false);
  const [snoozingShortShiftReminder, setSnoozingShortShiftReminder] = useState(false);
  const [loading, setLoading] = useState(true);

  const detectStampPrompt = useCallback(
    async (profileId: string, spaceId: string | null): Promise<StampPrompt | null> => {
      if (!spaceId) return null;
      const storageProfileId = buildSpaceProfileKey(spaceId, profileId);
      const forcedPrompt = await getTimeClockTestPrompt(storageProfileId);
      if (forcedPrompt) {
        return {
          key: `test-${forcedPrompt.createdAt}`,
          shiftDateISO: forcedPrompt.shiftDateISO,
          shiftCode: forcedPrompt.shiftCode,
          eventType: forcedPrompt.eventType,
          source: 'test',
        };
      }

      const config = await getTimeClockConfigOrDefault(storageProfileId);
      const events = await getTimeClockEvents(storageProfileId);
      const now = new Date();
      const today = todayISO();
      const yesterday = plusDays(today, -1);

      const candidateDates = [yesterday, today];
      const candidates: Array<{
        shiftDateISO: string;
        shiftCode: RegularShiftCode;
        stampState: ReturnType<typeof deriveTimeClockStampState>;
        inStartWindow: boolean;
        inEndWindow: boolean;
      }> = [];

      for (const shiftDateISO of candidateDates) {
        const shiftCode = await getShiftForDateForSpace(spaceId, profileId, shiftDateISO);
        if (!isRegularShiftCode(shiftCode)) continue;

        const settings = config.shiftSettings[shiftCode];
        const startAt = toDateFromISOAndTime(shiftDateISO, settings.startTime);
        let endAt = toDateFromISOAndTime(shiftDateISO, settings.endTime);
        if (endAt <= startAt) {
          endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
        }

        const startWindowFrom = new Date(startAt.getTime() - settings.paidFlexMinutes * 60 * 1000);
        const startWindowTo = new Date(startAt.getTime() + settings.paidFlexMinutes * 60 * 1000);
        const endWindowFrom = new Date(endAt.getTime() - settings.paidFlexMinutes * 60 * 1000);
        const endWindowTo = new Date(endAt.getTime() + settings.postShiftGraceMinutes * 60 * 1000);

        const shiftEvents = events.filter(
          (e) => e.dateISO === shiftDateISO && e.shiftCode === shiftCode
        );
        const stampState = deriveTimeClockStampState(shiftEvents);

        const inEndWindow = now >= endWindowFrom && now <= endWindowTo;
        const inStartWindow = now >= startWindowFrom && now <= startWindowTo;
        candidates.push({
          shiftDateISO,
          shiftCode,
          stampState,
          inStartWindow,
          inEndWindow,
        });
      }

      // Popup ist absichtlich fenstergebunden:
      // ausserhalb endWindowTo wird hier kein check_out-Popup mehr angeboten.
      // Der Service-Screen zeigt offene Dienste weiterhin event-basiert zur manuellen Nacherfassung.
      // Prioritaet: offenen Dienst zuerst sauber schliessen, erst danach neuen Dienst starten.
      for (const candidate of candidates) {
        if (candidate.inEndWindow && candidate.stampState.phase === 'awaiting_check_out') {
          return {
            key: `${candidate.shiftDateISO}-${candidate.shiftCode}-check_out`,
            shiftDateISO: candidate.shiftDateISO,
            shiftCode: candidate.shiftCode,
            eventType: 'check_out',
            source: 'window',
          };
        }
      }

      for (const candidate of candidates) {
        if (candidate.inStartWindow && candidate.stampState.phase === 'awaiting_check_in') {
          return {
            key: `${candidate.shiftDateISO}-${candidate.shiftCode}-check_in`,
            shiftDateISO: candidate.shiftDateISO,
            shiftCode: candidate.shiftCode,
            eventType: 'check_in',
            source: 'window',
          };
        }
      }
      return null;
    },
    []
  );

  const detectSpaceStatusPrompt = useCallback(
    async (profileId: string, spaceId: string): Promise<SpaceStatusEvent | null> => {
      let events: SpaceStatusEvent[];
      try {
        const remote = await pullSpaceStatusEvents(spaceId);
        events =
          remote.length > 0
            ? await upsertSpaceStatusEvents(spaceId, remote)
            : await getSpaceStatusEvents(spaceId);
      } catch {
        events = await getSpaceStatusEvents(spaceId);
      }

      const seen = new Set(await getSeenSpaceStatusEventIds(profileId));
      for (const event of events) {
        if (event.type !== 'day_status_changed') continue;
        if (event.actorProfileId === profileId) continue;
        if (seen.has(event.id)) continue;
        const ownShift = event.dateISO ? await getShiftForDateForSpace(spaceId, profileId, event.dateISO) : null;
        if (isShiftpalRelevantStatusEvent(event, profileId, ownShift)) {
          return event;
        }
      }
      return null;
    },
    []
  );

  const loadCurrentContext = useCallback(async () => {
    setLoading(true);
    logInfo('StartScreen', 'loadCurrentContext');
    const p = await getProfile();
    const s = await getSpaces();
    let hasShift = false;
    let swapCount = 0;
    if (p) {
      const currentId = await getCurrentSpaceId();
      const plan = currentId ? await getShiftPlanForSpace(currentId, p.id) : null;
      hasShift = plan !== null && plan.pattern.length > 0;
      if (currentId) {
        const openSwaps = await getOpenSwapRequests(currentId);
        swapCount = openSwaps.length;
        setSpaceStatusPrompt(await detectSpaceStatusPrompt(p.id, currentId));
      } else {
        setSpaceStatusPrompt(null);
      }
      const prompt = await detectStampPrompt(p.id, currentId);
      // Auto-Platzhalter für vergessene Stempelzeiten (best-effort, idempotent).
      // P0 (2026-04-11): Fehler werden erfasst und im Banner angezeigt.
      // Erfolg löscht den Fehlerzustand (stale Messages werden aufgelöst).
      let newPlaceholders = 0;
      try {
        newPlaceholders = await autoStampMissedShifts(p.id, { spaceId: currentId });
        setAutoStampError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setAutoStampError(`Auto-Platzhalter konnte nicht ausgeführt werden: ${msg}`);
      }
      setMissedStampCount(newPlaceholders);
      const reminderProfileId = currentId ? buildSpaceProfileKey(currentId, p.id) : p.id;
      const shortShiftReminders = await getOpenShortShiftVacationReminders(reminderProfileId);
      setShortShiftReminder(shortShiftReminders.length > 0 ? shortShiftReminders[0] : null);
      const promptWasAlreadyCompleted = prompt
        ? completedPromptKeysRef.current.has(prompt.key)
        : false;
      if (prompt && prompt.key !== dismissedPromptKey && !promptWasAlreadyCompleted) {
        setStampPrompt(prompt);
      } else if (!prompt || promptWasAlreadyCompleted) {
        setStampPrompt(null);
      }
    } else {
      setStampPrompt(null);
      setShortShiftReminder(null);
      setSpaceStatusPrompt(null);
      setMissedStampCount(0);
      setAutoStampError(null);
    }
    setProfile(p);
    setHasSpaces(s.length > 0);
    setHasShiftPlan(hasShift);
    setOpenSwapCount(swapCount);
    setLoading(false);
  }, [detectSpaceStatusPrompt, detectStampPrompt, dismissedPromptKey]);

  useFocusEffect(
    useCallback(() => {
      loadCurrentContext().catch(() => setLoading(false));
    }, [loadCurrentContext])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadCurrentContext().catch(() => null);
      }
    });
    return () => subscription.remove();
  }, [loadCurrentContext]);

  async function handleStampFromPopup() {
    if (!profile || !stampPrompt || stamping) return;
    const currentId = await getCurrentSpaceId();
    if (!currentId) return;
    const storageProfileId = buildSpaceProfileKey(currentId, profile.id);
    const promptToStamp = stampPrompt;
    setStamping(true);
    try {
      const now = new Date();
      await addTimeClockEvent(storageProfileId, {
        dateISO: promptToStamp.shiftDateISO,
        weekdayLabel: weekdayLabel(promptToStamp.shiftDateISO),
        shiftCode: promptToStamp.shiftCode,
        eventType: promptToStamp.eventType,
        timestampISO: now.toISOString(),
        source: promptToStamp.source === 'test' ? 'manual_test_popup' : 'manual_popup',
      });
      completedPromptKeysRef.current.add(promptToStamp.key);
      if (promptToStamp.source === 'test') {
        await clearTimeClockTestPrompt(storageProfileId);
      }
      setStampPrompt(null);
      setDismissedPromptKey(promptToStamp.key);
    } finally {
      setStamping(false);
    }
  }

  async function handleConfirmShortShiftReminder() {
    if (!profile || !shortShiftReminder) return;
    const currentId = await getCurrentSpaceId();
    const reminderProfileId = currentId ? buildSpaceProfileKey(currentId, profile.id) : profile.id;
    setConfirmingShortShiftReminder(true);
    await confirmShortShiftVacationReminder(reminderProfileId, shortShiftReminder.id);
    const remaining = await getOpenShortShiftVacationReminders(reminderProfileId);
    setShortShiftReminder(remaining.length > 0 ? remaining[0] : null);
    setConfirmingShortShiftReminder(false);
  }

  async function handleSnoozeShortShiftReminder() {
    if (!profile || !shortShiftReminder) return;
    const currentId = await getCurrentSpaceId();
    const reminderProfileId = currentId ? buildSpaceProfileKey(currentId, profile.id) : profile.id;
    setSnoozingShortShiftReminder(true);
    await snoozeShortShiftVacationReminder(reminderProfileId, shortShiftReminder.id);
    const remaining = await getOpenShortShiftVacationReminders(reminderProfileId);
    setShortShiftReminder(remaining.length > 0 ? remaining[0] : null);
    setSnoozingShortShiftReminder(false);
  }

  async function dismissSpaceStatusPrompt(openInfoService = false) {
    if (profile && spaceStatusPrompt) {
      await markSpaceStatusEventSeen(profile.id, spaceStatusPrompt.id);
    }
    setSpaceStatusPrompt(null);
    if (openInfoService) {
      router.push('/(services)/info-service');
    }
  }

  const canSnoozeShortShiftReminder =
    shortShiftReminder !== null &&
    diffDays(todayISO(), shortShiftReminder.dateISO) > 7;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.titleHero}>YASA</Text>
        <Text style={styles.subtitleHero}>Dein Schichtbegleiter</Text>
        <ActivityIndicator size="large" color={warmHuman.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Hero / Identity Bereich */}
      <View style={styles.heroSection}>
        <Text style={styles.titleHero}>YASA</Text>
        <Text style={styles.subtitleHero}>Dein Schichtbegleiter</Text>
      </View>

      {profile ? (
        <>
          {/* Profil-Card integriert im Hero */}
          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              <MultiavatarView uri={profile.avatarUrl} size={48} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileLabel}>Angemeldet als</Text>
                <Text style={styles.profileName}>{profile.displayName}</Text>
              </View>
            </View>
          </View>

          {/* Swap-Badge Banner */}
          {openSwapCount > 0 && (
            <TouchableOpacity
              style={styles.swapBanner}
              onPress={() => router.push('/(swap)')}
              activeOpacity={0.7}
            >
              <View style={styles.swapBadge}>
                <Text style={styles.swapBadgeText}>{openSwapCount}</Text>
              </View>
              <Text style={styles.swapBannerText}>
                {openSwapCount === 1
                  ? '1 offene Tauschanfrage'
                  : `${openSwapCount} offene Tauschanfragen`}
              </Text>
            </TouchableOpacity>
          )}

          {/* Platzhalter-Stempel Banner */}
          {missedStampCount > 0 && (
            <TouchableOpacity
              style={styles.missedStampBanner}
              onPress={() => router.push('/(services)/timeclock')}
              activeOpacity={0.7}
            >
              <Text style={styles.missedStampBannerText}>
                ⏱️{' '}
                {missedStampCount === 1
                  ? '1 Stempelzeit wurde als Platzhalter erfasst'
                  : `${missedStampCount} Stempelzeiten wurden als Platzhalter erfasst`}
              </Text>
              <Text style={styles.missedStampBannerLink}>Überprüfen →</Text>
            </TouchableOpacity>
          )}

          {/* Auto-Platzhalter Fehler Banner (P0 2026-04-11) */}
          {autoStampError !== null && (
            <View style={styles.autoStampErrorBanner} testID="autostamp-error-banner">
              <Text style={styles.autoStampErrorBannerText}>⚠️ {autoStampError}</Text>
            </View>
          )}

          {/* Hinweise wenn Space oder Shift fehlt */}
          {!hasSpaces && (
            <Text style={styles.hintText}>
              Du hast noch keinen Space. Erstelle einen oder trete einem bei.
            </Text>
          )}
          {hasSpaces && !hasShiftPlan && (
            <Text style={styles.hintText}>
              Richte deinen Schichtplan ein, um alle Features zu nutzen.
            </Text>
          )}

          {/* Primary Action Zone */}
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>Aktionen</Text>
          </View>
          
          <View style={styles.primaryActions}>
            {/* YASA Services - Hero Card */}
            <TouchableOpacity
              testID="start-services-card"
              style={styles.heroCard}
              onPress={() => router.push('/(services)')}
              activeOpacity={0.85}
            >
              <View style={styles.heroCardContent}>
                <Text style={styles.heroCardIcon}>✨</Text>
                <Text style={styles.heroCardTitle}>YASA Services</Text>
                <Text style={styles.heroCardDesc}>
                  Alle Features im Überblick
                </Text>
              </View>
              <Text style={styles.heroCardArrow}>→</Text>
            </TouchableOpacity>

            {/* Mein Kalender - Secondary Hero Card */}
            <TouchableOpacity
              style={styles.secondaryHeroCard}
              onPress={() => router.push('/(shift)/calendar')}
              activeOpacity={0.85}
            >
              <View style={styles.heroCardContent}>
                <Text style={styles.heroCardIcon}>📅</Text>
                <Text style={styles.secondaryHeroCardTitle}>Mein Kalender</Text>
                <Text style={styles.secondaryHeroCardDesc}>
                  Schichtplan im Blick
                </Text>
              </View>
              <Text style={styles.secondaryHeroCardArrow}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Secondary Action Zone */}
          <View style={styles.secondaryActions}>
            {/* Mein Space */}
            <TouchableOpacity
              style={styles.secondaryActionCard}
              onPress={() => router.push('/(space)/choose')}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryActionIcon}>🏠</Text>
              <Text style={styles.secondaryActionText}>
                {hasSpaces ? 'Mein Space' : 'Space beitreten'}
              </Text>
            </TouchableOpacity>

            {/* Admin Bereich */}
            <TouchableOpacity
              testID="start-admin-card"
              style={styles.secondaryActionCard}
              onPress={() => router.push('/(admin)')}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryActionIcon}>🔐</Text>
              <Text style={styles.secondaryActionText}>Admin</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        // ── Kein Profil ──────────────────────────────────────────────
        <>
          <Text style={styles.welcomeText}>
            Willkommen bei YASA! Erstelle ein Profil, um zu starten.
          </Text>
          <Button
            label="ID-Profil erstellen"
            onPress={() => router.push('/(auth)/create-profile')}
            fullWidth
            variant="hero"
          />
          <Button
            label="Transfer-QR scannen"
            onPress={() => router.push('/(space)/join')}
            fullWidth
            variant="heroSecondary"
            style={styles.transferScanButton}
          />
        </>
      )}

      <Modal
        visible={!!stampPrompt && !shortShiftReminder}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (stampPrompt) setDismissedPromptKey(stampPrompt.key);
          setStampPrompt(null);
        }}
      >
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>⏱️ Stempeluhr</Text>
            {stampPrompt && (
              <>
                <Text style={styles.promptText}>
                  {stampPrompt.eventType === 'check_in' ? 'Dein Dienst beginnt jetzt.' : 'Dein Dienst endet jetzt.'}
                </Text>
                <Text style={styles.promptMeta}>
                  {stampPrompt.shiftDateISO} · {weekdayLabel(stampPrompt.shiftDateISO)} ·{' '}
                  {stampPrompt.shiftCode} ({shiftLabelForStamp(stampPrompt.shiftCode)})
                </Text>
                <TouchableOpacity
                  style={styles.promptPrimaryBtn}
                  onPress={handleStampFromPopup}
                  disabled={stamping}
                >
                  <Text style={styles.promptPrimaryBtnText}>
                    {stamping
                      ? 'Speichert...'
                      : stampPrompt.eventType === 'check_in'
                        ? 'Kommen'
                        : 'Gehen'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.promptSecondaryBtn}
              onPress={() => {
                if (stampPrompt) setDismissedPromptKey(stampPrompt.key);
                if (profile && stampPrompt?.source === 'test') {
                  getCurrentSpaceId()
                    .then((spaceId) => spaceId ? clearTimeClockTestPrompt(buildSpaceProfileKey(spaceId, profile.id)) : null)
                    .catch(() => null);
                }
                setStampPrompt(null);
              }}
            >
              <Text style={styles.promptSecondaryBtnText}>Später</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!shortShiftReminder}
        transparent
        animationType="fade"
        onRequestClose={() => null}
      >
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>📝 Antrag Erinnerung</Text>
            {shortShiftReminder && (
              <>
                <Text style={styles.promptText}>
                  Für den kurzen Dienst {shortShiftReminder.shiftCode} am {shortShiftReminder.dateISO} muss ein Antrag gestellt werden.
                </Text>
                <Text style={styles.promptMeta}>
                  {canSnoozeShortShiftReminder
                    ? 'Du kannst später erinnert werden. Ab 7 Tagen vor dem Termin bleibt die Erinnerung verpflichtend bis zur Bestätigung.'
                    : 'Ab jetzt bleibt diese Erinnerung verpflichtend, bis du den Antrag als eingereicht bestätigst.'}
                </Text>
              </>
            )}
            <TouchableOpacity
              style={styles.promptPrimaryBtn}
              onPress={handleConfirmShortShiftReminder}
              disabled={confirmingShortShiftReminder}
            >
              <Text style={styles.promptPrimaryBtnText}>
                {confirmingShortShiftReminder ? 'Speichert...' : 'Antrag eingereicht'}
              </Text>
            </TouchableOpacity>
            {canSnoozeShortShiftReminder && (
              <TouchableOpacity
                style={styles.promptSecondaryBtn}
                onPress={handleSnoozeShortShiftReminder}
                disabled={snoozingShortShiftReminder}
              >
                <Text style={styles.promptSecondaryBtnText}>
                  {snoozingShortShiftReminder ? 'Speichert...' : 'Später erinnern'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!spaceStatusPrompt && !stampPrompt && !shortShiftReminder}
        transparent
        animationType="fade"
        onRequestClose={() => {
          dismissSpaceStatusPrompt(false).catch(() => null);
        }}
      >
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Team-Status</Text>
            {spaceStatusPrompt && (
              <>
                <Text style={styles.promptText}>{spaceStatusPrompt.body}</Text>
                {!!spaceStatusPrompt.dateISO && (
                  <Text style={styles.promptMeta}>Betroffener Tag: {spaceStatusPrompt.dateISO}</Text>
                )}
              </>
            )}
            <TouchableOpacity
              style={styles.promptPrimaryBtn}
              onPress={() => dismissSpaceStatusPrompt(true).catch(() => null)}
            >
              <Text style={styles.promptPrimaryBtnText}>Infoservice öffnen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.promptSecondaryBtn}
              onPress={() => dismissSpaceStatusPrompt(false).catch(() => null)}
            >
              <Text style={styles.promptSecondaryBtnText}>Verstanden</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: warmHuman.surface,
    paddingHorizontal: spacing.lg,
  },
  container: {
    flexGrow: 1,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing['2xl'],
  },
  // Hero Section
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  titleHero: {
    fontSize: typography.fontSize['5xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
    color: warmHuman.ink,
  },
  subtitleHero: {
    fontSize: typography.fontSize.lg,
    color: warmHuman.textSecondary,
  },
  // Profile Card
  profileCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  profileLabel: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    marginBottom: 2,
  },
  profileName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.ink,
  },
  // Section Label
  sectionLabel: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionLabelText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: warmHuman.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Hint Text
  hintText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  // Primary Actions
  primaryActions: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroCard: {
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.lg,
  },
  heroCardContent: {
    flex: 1,
  },
  heroCardIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  heroCardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.textInverse,
    marginBottom: 2,
  },
  heroCardDesc: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  heroCardArrow: {
    fontSize: 24,
    color: warmHuman.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryHeroCard: {
    backgroundColor: warmHuman.accent,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  secondaryHeroCardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: 2,
  },
  secondaryHeroCardDesc: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.inkLight,
  },
  secondaryHeroCardArrow: {
    fontSize: 24,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
  },
  // Secondary Actions
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryActionCard: {
    flex: 1,
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.sm,
  },
  secondaryActionIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  secondaryActionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: warmHuman.textSecondary,
    textAlign: 'center',
  },
  // Swap Banner
  swapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: warmHuman.accentLight,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: warmHuman.accent,
    gap: spacing.sm,
  },
  swapBadge: {
    backgroundColor: warmHuman.accent,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  swapBadgeText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  swapBannerText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  // Missed Stamp Banner
  missedStampBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: warmHuman.textMuted,
    gap: spacing.sm,
  },
  missedStampBannerText: {
    flex: 1,
    color: warmHuman.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  missedStampBannerLink: {
    color: warmHuman.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  // AutoStamp Error Banner (P0 2026-04-11)
  autoStampErrorBanner: {
    backgroundColor: '#FFEBEE',
    borderRadius: borderRadius.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E57373',
  },
  autoStampErrorBannerText: {
    color: '#B71C1C',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  // Welcome
  welcomeText: {
    color: warmHuman.textSecondary,
    fontSize: typography.fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  transferScanButton: {
    marginTop: spacing.md,
  },
  // Stempeluhr Popup
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  promptCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.md,
  },
  promptTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.xs,
  },
  promptText: {
    fontSize: typography.fontSize.base,
    color: warmHuman.textSecondary,
    marginBottom: spacing.xs,
  },
  promptMeta: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textMuted,
    marginBottom: spacing.md,
  },
  promptPrimaryBtn: {
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  promptPrimaryBtnText: {
    color: warmHuman.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  promptSecondaryBtn: {
    backgroundColor: warmHuman.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    paddingVertical: 10,
    alignItems: 'center',
  },
  promptSecondaryBtnText: {
    color: warmHuman.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
