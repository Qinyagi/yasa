import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  getCurrentSpaceId,
  getProfile,
  getShiftForDate,
  getSpaces,
  getSpaceStatusEvents,
  setSpaces,
  upsertSpaceStatusEvents,
} from '../../lib/storage';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { pullSpaceStatusEvents, useRealtimeSpaceStatus } from '../../lib/backend/spaceStatusSync';
import { isShiftpalRelevantStatusEvent } from '../../lib/spaceStatusRelevance';
import type { Space, UserProfile } from '../../types';
import type { SpaceStatusEvent } from '../../types/spaceStatus';
import { borderRadius, shadows, spacing, typography, warmHuman } from '../../constants/theme';

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function eventAccent(type: SpaceStatusEvent['type']): string {
  if (type === 'day_status_changed') return warmHuman.primary;
  if (type === 'swap_updated') return warmHuman.accent;
  if (type === 'vacation_planning_updated') return '#0F766E';
  if (type === 'ghost_presence_updated') return '#7C3AED';
  return warmHuman.textMuted;
}

async function filterRelevantEvents(
  profileId: string,
  items: SpaceStatusEvent[]
): Promise<SpaceStatusEvent[]> {
  const result: SpaceStatusEvent[] = [];
  for (const event of items) {
    const ownShift = event.dateISO ? await getShiftForDate(profileId, event.dateISO) : null;
    if (isShiftpalRelevantStatusEvent(event, profileId, ownShift)) {
      result.push(event);
    }
  }
  return result;
}

export default function InfoServiceScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [events, setEvents] = useState<SpaceStatusEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (allowCachedSync = false) => {
    const [p, currentSpaceId, localSpaces] = await Promise.all([
      getProfile(),
      getCurrentSpaceId(),
      getSpaces(),
    ]);
    setProfile(p);

    if (!p || !currentSpaceId) {
      setSpace(null);
      setEvents([]);
      setLoading(false);
      return;
    }

    let spaces = localSpaces;
    try {
      const syncResult = await syncTeamSpaces(
        p.id,
        localSpaces,
        allowCachedSync ? { allowCached: true } : {}
      );
      spaces = syncResult.spaces;
      await setSpaces(spaces);
    } catch {
      // best effort; local space cache remains useful
    }

    const activeSpace = spaces.find((item) => item.id === currentSpaceId) ?? null;
    setSpace(activeSpace);
    if (!activeSpace) {
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      const remote = await pullSpaceStatusEvents(activeSpace.id);
      let nextEvents: SpaceStatusEvent[];
      if (remote.length > 0) {
        nextEvents = await upsertSpaceStatusEvents(activeSpace.id, remote);
      } else {
        nextEvents = await getSpaceStatusEvents(activeSpace.id);
      }
      setEvents(await filterRelevantEvents(p.id, nextEvents));
    } catch {
      setEvents(await filterRelevantEvents(p.id, await getSpaceStatusEvents(activeSpace.id)));
    }
    setLoading(false);
  }, []);

  useRealtimeSpaceStatus(
    profile?.id,
    space ? [space.id] : [],
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadData(true).finally(() => {
        if (!active) return;
      });
      return () => {
        active = false;
      };
    }, [loadData])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={warmHuman.primary} />
      </View>
    );
  }

  if (!profile || !space) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Space benötigt</Text>
        <Text style={styles.emptyText}>
          Der Infoservice zeigt Meldungen aus deinem aktiven Team-Space.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.primaryBtnText}>Space wählen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>YASA Infoservice</Text>
      <Text style={styles.subtitle}>{space.name}</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Shiftpal-relevante Statusmeldungen</Text>
        <Text style={styles.summaryText}>
          Hier erscheinen nur Änderungen, die deine eigene Schicht am betroffenen Tag berühren.
        </Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Noch keine Meldungen</Text>
          <Text style={styles.emptyText}>
            Sobald ein Teammitglied einen dienstplanrelevanten Status ändert, erscheint hier die erste Meldung.
          </Text>
        </View>
      ) : (
        <View style={styles.feed}>
          {events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={[styles.eventRail, { backgroundColor: eventAccent(event.type) }]} />
              <View style={styles.eventContent}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventTime}>{formatEventTime(event.createdAt)}</Text>
                </View>
                <Text style={styles.eventBody}>{event.body}</Text>
                {!!event.dateISO && <Text style={styles.eventMeta}>Datum: {event.dateISO}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/(services)')}>
        <Text style={styles.secondaryBtnText}>Zurück zu Services</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: warmHuman.surface,
  },
  container: {
    flexGrow: 1,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: 58,
    paddingBottom: 42,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.primary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  summaryTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.xs,
  },
  summaryText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
  },
  feed: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    overflow: 'hidden',
    ...shadows.sm,
  },
  eventRail: {
    width: 5,
  },
  eventContent: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eventTitle: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
  },
  eventTime: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
  },
  eventBody: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 19,
  },
  eventMeta: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryBtn: {
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: {
    color: warmHuman.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryBtn: {
    backgroundColor: warmHuman.surfaceWarm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});
