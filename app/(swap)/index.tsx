import { useState, useCallback } from 'react';
import { colors, SHIFT_META, MONTH_LABELS, MONTH_LABELS_SHORT, WEEKDAY_LABELS } from '../../constants/theme';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button } from '../../components/Button';
import { BottomActionBar } from '../../components/BottomActionBar';
import {
  getProfile,
  getCurrentSpaceId,
  getSpaces,
  setSpaces,
  getPreparedIdProfiles,
  getShiftForDate,
  getSwapCandidates,
  createSwapRequest,
  acceptSwapRequest,
  declineSwapRequest,
  cancelSwapRequest,
  getOpenSwapRequests,
  getMySwapRequests,
  todayISO,
  isValidISODate,
  type SwapCandidate,
} from '../../lib/storage';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { buildPreparedSwapCandidates } from '../../lib/preparedProfilesShiftpals';
import type { SwapRequest, ShiftType, UserProfile, Space } from '../../types';

const PAGE_PADDING = 24;

type TabType = 'open' | 'mine';

interface SwapCandidateView extends SwapCandidate {
  isPrepared?: boolean;
  preparedProfileId?: string;
}

function padTwo(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatGerman(dateISO: string): string {
  const [y, m, d] = dateISO.split('-');
  return `${d}.${m}.${y}`;
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${padTwo(m)}-${padTwo(d)}`;
}

function getCalendarDays(year: number, month: number): { dateISO: string; inMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const days: { dateISO: string; inMonth: boolean }[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ dateISO: toISO(d.getFullYear(), d.getMonth() + 1, d.getDate()), inMonth: false });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ dateISO: toISO(year, month + 1, d), inMonth: true });
  }

  while (days.length % 7 !== 0) {
    const next = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1);
    days.push({
      dateISO: toISO(next.getFullYear(), next.getMonth() + 1, next.getDate()),
      inMonth: false,
    });
  }

  return days;
}

export default function SwapScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ dateISO?: string }>();
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  // A1-02: Space-Objekt + Membership guard
  const [space, setSpace] = useState<Space | null>(null);
  const [isMember, setIsMember] = useState(true);
  const [tab, setTab] = useState<TabType>('open');
  
  // Neuanfrage State
  const [selectedDate, setSelectedDate] = useState(params.dateISO || todayISO());
  const [myShift, setMyShift] = useState<ShiftType | null>(null);
  const [candidates, setCandidates] = useState<SwapCandidateView[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = params.dateISO && isValidISODate(params.dateISO) ? params.dateISO : todayISO();
    const [y, m] = initial.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  
  // Requests
  const [openRequests, setOpenRequests] = useState<SwapRequest[]>([]);
  const [myRequests, setMyRequests] = useState<SwapRequest[]>([]);

  const loadScreenData = useCallback(async (forDate: string) => {
    const p = await getProfile();
    setProfile(p);

    if (!p) {
      setLoading(false);
      return;
    }

    const sid = await getCurrentSpaceId();
    setSpaceId(sid);

    if (!sid) {
      setLoading(false);
      return;
    }

    const localSpaces = await getSpaces();
    let allSpaces = localSpaces;
    try {
      const syncResult = await syncTeamSpaces(p.id, localSpaces, { allowCached: true, ttlMs: 10_000 });
      allSpaces = syncResult.spaces;
      await setSpaces(allSpaces);
    } catch {
      // Best effort: keep local swap workflow available.
    }

    const activeSpace = allSpaces.find((s) => s.id === sid) ?? null;
    setSpace(activeSpace);

    if (activeSpace) {
      const memberOk = activeSpace.memberProfiles.some((m) => m.id === p.id);
      if (!memberOk) {
        setIsMember(false);
        setLoading(false);
        return;
      }
    }
    setIsMember(true);

    const open = await getOpenSwapRequests(sid);
    setOpenRequests(open);

    const mine = await getMySwapRequests(p.id);
    setMyRequests(mine);

    const shift = await getShiftForDate(p.id, forDate);
    setMyShift(shift);

    const activeMemberIds = activeSpace?.memberProfiles.map((member) => member.id) ?? [];
    const cands: SwapCandidateView[] = await getSwapCandidates(sid, forDate, p.id);
    const preparedProfiles = await getPreparedIdProfiles(sid);
    const preparedCandidates: SwapCandidateView[] = buildPreparedSwapCandidates(
      preparedProfiles,
      forDate,
      activeMemberIds
    ).map((entry) => ({
      profileId: entry.member.id,
      displayName: entry.member.displayName,
      avatarUrl: entry.member.avatarUrl ?? '',
      shiftCode: entry.code,
      isPrepared: true,
      preparedProfileId: entry.preparedProfileId,
    }));
    setCandidates([...cands, ...preparedCandidates]);

    setLoading(false);
  }, []);

  // Load data
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      loadScreenData(selectedDate).catch(() => {
        if (active) setLoading(false);
      });

      return () => { active = false; };
    }, [loadScreenData, selectedDate])
  );

  // Neuanfrage erstellen
  async function handleCreateRequest() {
    // --- BUG FIX #3: Datum-Validierung im UI ---
    if (!isValidISODate(selectedDate)) {
      Alert.alert('Ungültiges Datum', 'Bitte Datum im Format YYYY-MM-DD eingeben (z.B. 2026-02-20).');
      return;
    }
    
    if (!profile || !spaceId || !myShift) {
      Alert.alert('Fehler', 'Du hast keinen Schichtplan.');
      return;
    }
    
    setSubmitting(true);
    try {
      await createSwapRequest(spaceId, profile.id, selectedDate, myShift, message || undefined);
      Alert.alert('Erfolg', 'Tauschanfrage erstellt!');
      setMessage('');
      // Refresh
      const open = await getOpenSwapRequests(spaceId);
      setOpenRequests(open);
      const mine = await getMySwapRequests(profile.id);
      setMyRequests(mine);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Konnte Anfrage nicht erstellen.';
      Alert.alert('Fehler', msg);
    }
    setSubmitting(false);
  }

  // Anfrage annehmen
  async function handleAccept(requestId: string) {
    if (!profile) return;
    
    const result = await acceptSwapRequest(requestId, profile.id);
    if (result.ok) {
      Alert.alert('Erfolg', 'Tausch angenommen!');
      // Refresh
      if (spaceId) {
        const open = await getOpenSwapRequests(spaceId);
        setOpenRequests(open);
      }
    } else {
      Alert.alert('Fehler', result.reason);
    }
  }

  // Anfrage ablehnen
  async function handleDecline(requestId: string) {
    const result = await declineSwapRequest(requestId);
    if (result.ok) {
      // Refresh
      if (spaceId) {
        const open = await getOpenSwapRequests(spaceId);
        setOpenRequests(open);
      }
    }
  }

  // Meine Anfrage abbrechen
  async function handleCancel(requestId: string) {
    if (!profile) return;
    
    Alert.alert(
      'Anfrage abbrechen?',
      'Möchtest du diese Tauschanfrage zurückziehen?',
      [
        { text: 'Nein', style: 'cancel' },
        {
          text: 'Ja, abbrechen',
          style: 'destructive',
          onPress: async () => {
            await cancelSwapRequest(requestId, profile.id);
            // Refresh
            const mine = await getMySwapRequests(profile.id);
            setMyRequests(mine);
            if (spaceId) {
              const open = await getOpenSwapRequests(spaceId);
              setOpenRequests(open);
            }
          },
        },
      ]
    );
  }

  function formatDate(dateISO: string): string {
    const [, m, d] = dateISO.split('-');
    return `${d}.${MONTH_LABELS_SHORT[parseInt(m, 10) - 1]}`;
  }

  // Datum wechseln → Shift + Kandidaten nachladen
  async function handleDateChange(newDate: string) {
    setSelectedDate(newDate);
  }

  function openCalendar() {
    const base = isValidISODate(selectedDate) ? selectedDate : todayISO();
    const [y, m] = base.split('-').map(Number);
    setCalendarMonth(new Date(y, m - 1, 1));
    setShowCalendar(true);
  }

  function handleBackToStart() {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }

  function handleBackToServices() {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(services)');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Guard: kein Profil ───────────────────────────────────────────────
  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardEmoji}>👤</Text>
        <Text style={styles.guardTitle}>Profil benötigt</Text>
        <Text style={styles.guardDesc}>Du brauchst ein Profil, um Schichten zu tauschen.</Text>
        <TouchableOpacity style={styles.guardBtn} onPress={() => router.replace('/(auth)/create-profile')}>
          <Text style={styles.guardBtnText}>Profil erstellen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.guardBtnSecondary} onPress={handleBackToStart}>
          <Text style={styles.guardBtnSecondaryText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Guard: kein Space aktiv ──────────────────────────────────────────
  if (!spaceId) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardEmoji}>🏠</Text>
        <Text style={styles.guardTitle}>Space benötigt</Text>
        <Text style={styles.guardDesc}>Du brauchst einen aktiven Space, um Dienste tauschen zu können.</Text>
        <TouchableOpacity style={styles.guardBtn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.guardBtnText}>Space wählen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.guardBtnSecondary} onPress={handleBackToServices}>
          <Text style={styles.guardBtnSecondaryText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Guard: kein Mitglied im currentSpace (A1-02) ──────────────────────
  if (!isMember) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardEmoji}>⚠️</Text>
        <Text style={styles.guardTitle}>Kein Mitglied</Text>
        <Text style={styles.guardDesc}>
          Du bist kein Mitglied im aktiven Space{space ? ` „${space.name}"` : ''}.
        </Text>
        <TouchableOpacity style={styles.guardBtn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.guardBtnText}>Space wechseln</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.guardBtnSecondary} onPress={handleBackToServices}>
          <Text style={styles.guardBtnSecondaryText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text testID="swap-title" style={styles.title}>🔄 Dienst tauschen</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          testID="swap-tab-open"
          style={[styles.tab, tab === 'open' && styles.tabActive]}
          onPress={() => setTab('open')}
        >
          <Text style={[styles.tabText, tab === 'open' && styles.tabTextActive]}>
            Offene Anfragen ({openRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="swap-tab-mine"
          style={[styles.tab, tab === 'mine' && styles.tabActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
            Meine Anfragen ({myRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {tab === 'open' ? (
        <FlatList
          data={openRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>Keine offenen Anfragen</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={styles.requestDateBox}>
                  <Text style={styles.requestDate}>{formatDate(item.date)}</Text>
                  <View style={[styles.shiftBadge, { backgroundColor: SHIFT_META[item.shiftCode]?.bg || '#eee' }]}>
                    <Text style={[styles.shiftBadgeText, { color: SHIFT_META[item.shiftCode]?.fg || '#666' }]}>
                      {item.shiftCode}
                    </Text>
                  </View>
                </View>
                <Text style={styles.requestStatus}>{item.status}</Text>
              </View>
              
              {item.message && (
                <Text style={styles.requestMessage}>„{item.message}“</Text>
              )}
              
              <View style={styles.requestActions}>
                {item.requesterProfileId !== profile?.id ? (
                  <>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAccept(item.id)}
                    >
                      <Text style={styles.acceptBtnText}>Übernehmen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => handleDecline(item.id)}
                    >
                      <Text style={styles.declineBtnText}>Ablehnen</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => handleCancel(item.id)}
                  >
                    <Text style={styles.cancelBtnText}>Zurückziehen</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={myRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.createSection}>
              <Text style={styles.sectionTitle}>Neue Anfrage erstellen</Text>
              
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Datum:</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={openCalendar}
                  activeOpacity={0.75}
                >
                  <Text style={styles.datePickerText}>{formatGerman(selectedDate)}</Text>
                  <Text style={styles.datePickerIcon}>📅</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Mein Shift:</Text>
                <View style={[styles.shiftPreview, { backgroundColor: myShift ? SHIFT_META[myShift]?.bg : '#eee' }]}>
                  <Text style={[styles.shiftPreviewText, { color: myShift ? SHIFT_META[myShift]?.fg : '#666' }]}>
                    {myShift || '—'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Nachricht:</Text>
                <TextInput
                  style={styles.messageInput}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Optionale Nachricht..."
                  multiline
                />
              </View>
              
              <TouchableOpacity
                style={[styles.createBtn, (!myShift || submitting) && styles.createBtnDisabled]}
                onPress={handleCreateRequest}
                disabled={!myShift || submitting}
              >
                <Text style={styles.createBtnText}>
                  {submitting ? 'Wird erstellt...' : 'Anfrage erstellen'}
                </Text>
              </TouchableOpacity>
              
              <Text style={styles.candidatesTitle}>
                Mögliche Tauschpartner ({candidates.length}):
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>Du hast keine Anfragen</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.requestCard, styles.myRequestCard]}>
              <View style={styles.requestHeader}>
                <View style={styles.requestDateBox}>
                  <Text style={styles.requestDate}>{formatDate(item.date)}</Text>
                  <View style={[styles.shiftBadge, { backgroundColor: SHIFT_META[item.shiftCode]?.bg || '#eee' }]}>
                    <Text style={[styles.shiftBadgeText, { color: SHIFT_META[item.shiftCode]?.fg || '#666' }]}>
                      {item.shiftCode}
                    </Text>
                  </View>
                </View>
                <Text style={[
                  styles.requestStatus,
                  item.status === 'accepted' && styles.statusAccepted,
                  item.status === 'declined' && styles.statusDeclined,
                  item.status === 'cancelled' && styles.statusCancelled,
                ]}>
                  {item.status === 'open' ? '🟡 Offen' : 
                   item.status === 'accepted' ? '🟢 Angenommen' :
                   item.status === 'declined' ? '🔴 Abgelehnt' : '⚪ Zurückgezogen'}
                </Text>
              </View>
              
              {item.status === 'open' && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleCancel(item.id)}
                >
                  <Text style={styles.cancelBtnText}>Zurückziehen</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListFooterComponent={
            candidates.length > 0 ? (
              <View style={styles.candidatesSection}>
                {candidates.map((cand) => (
                  <View key={cand.profileId} style={styles.candidateItem}>
                    <View style={styles.candidateInfo}>
                      <Text style={styles.candidateName}>{cand.displayName}</Text>
                      <View style={[styles.candidateShift, { backgroundColor: cand.shiftCode ? SHIFT_META[cand.shiftCode]?.bg : '#eee' }]}>
                        <Text style={[styles.candidateShiftText, { color: cand.shiftCode ? SHIFT_META[cand.shiftCode]?.fg : '#666' }]}>
                          {cand.shiftCode || 'X'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.candidateStatus}>
                      {cand.shiftCode === null ? 'Frei' : cand.shiftCode === 'R' ? 'Ruhe' :
                       cand.shiftCode === 'U' ? 'Urlaub' : cand.shiftCode === 'X' ? 'Frei' : 'Gebucht'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}

      <BottomActionBar style={styles.bottomActionBar}>
        <Button
          label="Zurück"
          onPress={handleBackToServices}
          variant="primary"
          fullWidth
        />
      </BottomActionBar>

      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCalendar(false)}>
          <Pressable style={styles.calendarModal} onPress={() => {}}>
            <View style={styles.calMonthRow}>
              <TouchableOpacity
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                style={styles.calArrowBtn}
              >
                <Text style={styles.calArrowText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calMonthLabel}>
                {MONTH_LABELS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                style={styles.calArrowBtn}
              >
                <Text style={styles.calArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calWeekRow}>
              {WEEKDAY_LABELS.map((d) => (
                <Text key={d} style={styles.calWeekCell}>{d}</Text>
              ))}
            </View>

            {(() => {
              const days = getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth());
              const rows = Math.ceil(days.length / 7);
              const todayStr = todayISO();
              return Array.from({ length: rows }).map((_, rowIdx) => (
                <View key={rowIdx} style={styles.calDayRow}>
                  {days.slice(rowIdx * 7, rowIdx * 7 + 7).map((day) => {
                    const isSelected = day.dateISO === selectedDate;
                    const isToday = day.dateISO === todayStr;
                    return (
                      <TouchableOpacity
                        key={day.dateISO}
                        style={[
                          styles.calDayCell,
                          !day.inMonth && styles.calDayCellOutside,
                          isSelected && styles.calDayCellSelected,
                          isToday && !isSelected && styles.calDayCellToday,
                        ]}
                        onPress={() => {
                          handleDateChange(day.dateISO);
                          setShowCalendar(false);
                        }}
                        activeOpacity={0.6}
                      >
                        <Text
                          style={[
                            styles.calDayText,
                            !day.inMonth && styles.calDayTextOutside,
                            isSelected && styles.calDayTextSelected,
                          ]}
                        >
                          {parseInt(day.dateISO.split('-')[2], 10)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ));
            })()}

            <TouchableOpacity
              style={styles.calTodayBtn}
              onPress={() => {
                const today = todayISO();
                const [y, m] = today.split('-').map(Number);
                setCalendarMonth(new Date(y, m - 1, 1));
                handleDateChange(today);
                setShowCalendar(false);
              }}
            >
              <Text style={styles.calTodayBtnText}>Heute wählen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.calCloseBtn} onPress={() => setShowCalendar(false)}>
              <Text style={styles.calCloseBtnText}>Schließen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  
  header: { paddingHorizontal: PAGE_PADDING, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  
  tabRow: { flexDirection: 'row', paddingHorizontal: PAGE_PADDING, marginBottom: 16, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.backgroundTertiary, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.textInverse },
  
  listContent: { paddingHorizontal: PAGE_PADDING, paddingBottom: 110 },
  
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  
  requestCard: { backgroundColor: colors.backgroundSecondary, borderRadius: 12, padding: 16, marginBottom: 12 },
  myRequestCard: { backgroundColor: colors.primaryBackground, borderWidth: 1, borderColor: colors.primaryVariant },
  
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  requestDateBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestDate: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  shiftBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  shiftBadgeText: { fontSize: 12, fontWeight: '700' },
  requestStatus: { fontSize: 12, color: colors.textSecondary },
  statusAccepted: { color: colors.success },
  statusDeclined: { color: colors.error },
  statusCancelled: { color: colors.textSecondary },
  
  requestMessage: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 12 },
  
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, backgroundColor: colors.success, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  acceptBtnText: { color: colors.textInverse, fontSize: 14, fontWeight: '600' },
  declineBtn: { flex: 1, backgroundColor: colors.backgroundTertiary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  declineBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  cancelBtn: { backgroundColor: colors.errorBackground, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { color: colors.error, fontSize: 14, fontWeight: '600' },
  
  createSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  inputLabel: { width: 80, fontSize: 14, color: colors.textSecondary },
  datePickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.backgroundTertiary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePickerText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  datePickerIcon: { fontSize: 16 },
  shiftPreview: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  shiftPreviewText: { fontSize: 14, fontWeight: '700' },
  messageInput: { flex: 1, borderWidth: 1, borderColor: colors.grayLight, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  
  createBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  createBtnDisabled: { backgroundColor: colors.primaryVariant },
  createBtnText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
  
  candidatesTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 20, marginBottom: 12 },
  candidatesSection: { marginTop: 8 },
  candidateItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  candidateInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  candidateName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  candidateShift: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  candidateShiftText: { fontSize: 12, fontWeight: '700' },
  candidateStatus: { fontSize: 12, color: colors.textSecondary },

  // Guard screens
  guardEmoji: { fontSize: 48, marginBottom: 16 },
  guardTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  guardDesc: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 16 },
  guardBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, alignItems: 'center', width: '80%', marginBottom: 12 },
  guardBtnText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
  guardBtnSecondary: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28, alignItems: 'center', width: '80%', backgroundColor: colors.backgroundTertiary },
  guardBtnSecondaryText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },

  // Calendar modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModal: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 360,
  },
  calMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calArrowBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.backgroundTertiary,
  },
  calArrowText: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  calMonthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calWeekCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  calDayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calDayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    maxHeight: 40,
  },
  calDayCellOutside: {
    opacity: 0.3,
  },
  calDayCellSelected: {
    backgroundColor: colors.primary,
  },
  calDayCellToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  calDayText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  calDayTextOutside: {
    color: colors.textTertiary,
  },
  calDayTextSelected: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  calTodayBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  calTodayBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  calCloseBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.backgroundTertiary,
  },
  calCloseBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  bottomActionBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
