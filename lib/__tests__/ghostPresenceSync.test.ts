/**
 * ghostPresenceSync.test.ts — Unit tests for ghost presence propagation logic.
 *
 * Covers the pure algorithmic pieces for cross-device ghost presence sync.
 * All tests are pure-function: no AsyncStorage, no Supabase, no React.
 *
 * Test suites:
 *   G1: Ghost IDs included in the shift-plan pull set
 *   G2: mergeRemoteGhosts — new remote ghost added to local set
 *   G3: mergeRemoteGhosts — existing ghost metadata updated from remote (remote wins)
 *   G4: mergeRemoteGhosts — local-only ghost preserved when absent from remote
 *   G5: mergeRemoteGhosts — empty remote → no-op (local unchanged)
 *   G6: Ghost presence entry built from resolvedPlans when ghost plan exists
 *   G7: Ghost absent from resolvedPlans → not in ghostEntries (no crash)
 *   G8: Ghost plan push decision — plan present in resolvedPlans → should push
 *   G9: Ghost plan push decision — plan absent → skip (no crash)
 *   G10: Cross-device scenario: Device A marks present, Device B converges via sync
 *   G11: Duplicate ghost entries prevented — same ghost ID deduplicated
 *   G12: Archived ghost not included in pull set or ghostEntries
 */

// ─── Types (local mirrors) ────────────────────────────────────────────────────

interface MockGhost {
  id: string;
  displayName: string;
  avatarUrl: string;
  kind: 'ghost';
  ghostLabel?: string;
  ghostStatus: 'active' | 'archived';
  ghostSpaceId: string;
  createdByProfileId: string;
  createdAt: string;
}

interface MockShiftEntry {
  dateISO: string;
  code: string;
}

interface MockShiftPlan {
  profileId: string;
  startDateISO: string;
  pattern: string[];
  cycleLengthDays: number;
  generatedUntilISO: string;
  entries: MockShiftEntry[];
}

interface MockColleagueEntry {
  memberId: string;
  memberDisplayName: string;
  code: string;
  isGhost: boolean;
}

// ─── Pure algorithm extracts ──────────────────────────────────────────────────

/**
 * Builds the full pull set of profile IDs: real members + active ghost IDs.
 * Mirrors: today.tsx: [...memberIds, ...ghostIds]
 */
function buildPullSet(memberIds: string[], ghosts: MockGhost[]): string[] {
  const ghostIds = ghosts
    .filter((g) => g.ghostStatus === 'active')
    .map((g) => g.id);
  return Array.from(new Set([...memberIds, ...ghostIds]));
}

/**
 * Merge remote ghost definitions into a local ghost list.
 * Remote is authoritative on metadata for matching IDs.
 * Local-only ghosts are preserved.
 * Mirrors: storage.ts mergeRemoteGhosts (pure logic extract).
 */
function mergeRemoteGhosts(
  localGhosts: MockGhost[],
  remoteGhosts: MockGhost[]
): MockGhost[] {
  if (remoteGhosts.length === 0) return [...localGhosts];
  const byId = new Map<string, MockGhost>(localGhosts.map((g) => [g.id, g]));
  for (const remote of remoteGhosts) {
    if (!remote.id) continue;
    byId.set(remote.id, {
      ...(byId.get(remote.id) ?? ({} as MockGhost)),
      ...remote,
    });
  }
  return Array.from(byId.values());
}

/**
 * Build ghost presence entries from resolved shift plans.
 * Mirrors: today.tsx ghostEntries building loop.
 */
function buildGhostEntries(
  ghosts: MockGhost[],
  resolvedPlans: Record<string, MockShiftPlan>,
  todayISO: string
): MockColleagueEntry[] {
  const entries: MockColleagueEntry[] = [];
  for (const ghost of ghosts) {
    if (ghost.ghostStatus !== 'active') continue;
    const plan = resolvedPlans[ghost.id];
    if (!plan) continue;
    const entry = plan.entries.find((e) => e.dateISO === todayISO);
    if (entry) {
      entries.push({
        memberId: ghost.id,
        memberDisplayName: ghost.ghostLabel ?? ghost.displayName,
        code: entry.code,
        isGhost: true,
      });
    }
  }
  return entries;
}

/**
 * Decide whether to push a ghost's shift plan to backend after markGhostPresent.
 * Returns the plan to push, or null if absent (no push needed).
 * Mirrors: today.tsx handleConfirmGhostPresence push decision.
 */
function getGhostPlanToPush(
  ghostId: string,
  resolvedPlans: Record<string, MockShiftPlan>
): MockShiftPlan | null {
  return resolvedPlans[ghostId] ?? null;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failedLabels: string[] = [];

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    failedLabels.push(label);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = '2026-04-04';
const SPACE_ID = 'space-abc';

const HOST_ID = 'host-001';
const GUEST_ID = 'guest-002';

const GHOST_1: MockGhost = {
  id: 'ghost-uuid-aaa',
  displayName: 'Kollege A',
  avatarUrl: `${SPACE_ID}:kollege a`,
  kind: 'ghost',
  ghostLabel: 'Kollege A',
  ghostStatus: 'active',
  ghostSpaceId: SPACE_ID,
  createdByProfileId: HOST_ID,
  createdAt: '2026-04-01T10:00:00.000Z',
};

const GHOST_2: MockGhost = {
  id: 'ghost-uuid-bbb',
  displayName: 'Nachtschicht-Max',
  avatarUrl: `${SPACE_ID}:nachtschicht-max`,
  kind: 'ghost',
  ghostLabel: 'Nachtschicht-Max',
  ghostStatus: 'active',
  ghostSpaceId: SPACE_ID,
  createdByProfileId: HOST_ID,
  createdAt: '2026-04-02T08:00:00.000Z',
};

const GHOST_ARCHIVED: MockGhost = {
  ...GHOST_2,
  id: 'ghost-uuid-ccc',
  ghostStatus: 'archived',
};

const GHOST_1_PLAN: MockShiftPlan = {
  profileId: GHOST_1.id,
  startDateISO: TODAY,
  pattern: [],
  cycleLengthDays: 0,
  generatedUntilISO: TODAY,
  entries: [{ dateISO: TODAY, code: 'F' }],
};

// ─── Suite G1: Pull set inclusion ────────────────────────────────────────────

console.log('\n  G1 – Ghost IDs included in shift plan pull set');

assert(
  'G1-1: active ghost IDs appear in pull set',
  (() => {
    const set = buildPullSet([HOST_ID, GUEST_ID], [GHOST_1]);
    return set.includes(GHOST_1.id);
  })()
);

assert(
  'G1-2: real member IDs still present when ghosts added',
  (() => {
    const set = buildPullSet([HOST_ID, GUEST_ID], [GHOST_1, GHOST_2]);
    return set.includes(HOST_ID) && set.includes(GUEST_ID);
  })()
);

assert(
  'G1-3: no ghost IDs in pull set when ghost list is empty',
  (() => {
    const set = buildPullSet([HOST_ID], []);
    return set.length === 1 && set[0] === HOST_ID;
  })()
);

assert(
  'G1-4: archived ghost NOT included in pull set',
  (() => {
    const set = buildPullSet([HOST_ID], [GHOST_1, GHOST_ARCHIVED]);
    return !set.includes(GHOST_ARCHIVED.id);
  })()
);

assert(
  'G1-5: pull set has no duplicates when ghost ID already in memberIds',
  (() => {
    // Edge: ghost.id happens to equal a memberProfileId (should not occur, but safe)
    const set = buildPullSet([HOST_ID, GHOST_1.id], [GHOST_1]);
    return set.filter((id) => id === GHOST_1.id).length === 1;
  })()
);

// ─── Suite G2: mergeRemoteGhosts — new ghost added ───────────────────────────

console.log('\n  G2 – mergeRemoteGhosts: new remote ghost added to local');

assert(
  'G2-1: new remote ghost added when not in local',
  (() => {
    const merged = mergeRemoteGhosts([], [GHOST_1]);
    return merged.some((g) => g.id === GHOST_1.id);
  })()
);

assert(
  'G2-2: multiple new remote ghosts all added',
  (() => {
    const merged = mergeRemoteGhosts([], [GHOST_1, GHOST_2]);
    return (
      merged.some((g) => g.id === GHOST_1.id) &&
      merged.some((g) => g.id === GHOST_2.id)
    );
  })()
);

assert(
  'G2-3: local already has ghost → still present after merge',
  (() => {
    const merged = mergeRemoteGhosts([GHOST_1], [GHOST_1]);
    return merged.filter((g) => g.id === GHOST_1.id).length === 1;
  })()
);

// ─── Suite G3: mergeRemoteGhosts — metadata update ───────────────────────────

console.log('\n  G3 – mergeRemoteGhosts: remote metadata wins on overlap');

assert(
  'G3-1: remote ghostLabel overwrites stale local label',
  (() => {
    const staleLocal: MockGhost = { ...GHOST_1, ghostLabel: 'Old Label' };
    const fresh: MockGhost = { ...GHOST_1, ghostLabel: 'New Label' };
    const merged = mergeRemoteGhosts([staleLocal], [fresh]);
    return merged.find((g) => g.id === GHOST_1.id)?.ghostLabel === 'New Label';
  })()
);

assert(
  'G3-2: remote ghostStatus (archived) propagates on overlap',
  (() => {
    const localActive: MockGhost = { ...GHOST_1, ghostStatus: 'active' };
    const remoteArchived: MockGhost = { ...GHOST_1, ghostStatus: 'archived' };
    const merged = mergeRemoteGhosts([localActive], [remoteArchived]);
    return merged.find((g) => g.id === GHOST_1.id)?.ghostStatus === 'archived';
  })()
);

assert(
  'G3-3: other ghosts in local unchanged when only one ghost updated from remote',
  (() => {
    const merged = mergeRemoteGhosts([GHOST_1, GHOST_2], [GHOST_1]);
    return merged.some((g) => g.id === GHOST_2.id);
  })()
);

// ─── Suite G4: mergeRemoteGhosts — local-only ghost preserved ────────────────

console.log('\n  G4 – mergeRemoteGhosts: local-only ghost preserved');

assert(
  'G4-1: local ghost not in remote is preserved (pending push scenario)',
  (() => {
    const merged = mergeRemoteGhosts([GHOST_1, GHOST_2], [GHOST_1]);
    // GHOST_2 is local-only (not in remote) — must be preserved
    return merged.some((g) => g.id === GHOST_2.id);
  })()
);

assert(
  'G4-2: local-only ghost retains its original metadata',
  (() => {
    const merged = mergeRemoteGhosts([GHOST_1, GHOST_2], [GHOST_1]);
    const local2 = merged.find((g) => g.id === GHOST_2.id);
    return local2?.ghostLabel === GHOST_2.ghostLabel;
  })()
);

// ─── Suite G5: mergeRemoteGhosts — empty remote is no-op ─────────────────────

console.log('\n  G5 – mergeRemoteGhosts: empty remote → no-op');

assert(
  'G5-1: empty remote → local ghosts unchanged',
  (() => {
    const merged = mergeRemoteGhosts([GHOST_1, GHOST_2], []);
    return (
      merged.length === 2 &&
      merged.some((g) => g.id === GHOST_1.id) &&
      merged.some((g) => g.id === GHOST_2.id)
    );
  })()
);

assert(
  'G5-2: empty remote + empty local → empty result (no crash)',
  (() => {
    const merged = mergeRemoteGhosts([], []);
    return merged.length === 0;
  })()
);

// ─── Suite G6: Ghost presence entry building ─────────────────────────────────

console.log('\n  G6 – Ghost presence entry building from resolvedPlans');

assert(
  'G6-1: ghost with plan entry for today → appears in ghostEntries',
  (() => {
    const plans: Record<string, MockShiftPlan> = {
      [GHOST_1.id]: GHOST_1_PLAN,
    };
    const entries = buildGhostEntries([GHOST_1], plans, TODAY);
    return entries.length === 1 && entries[0].memberId === GHOST_1.id;
  })()
);

assert(
  'G6-2: ghostEntry has isGhost=true',
  (() => {
    const plans: Record<string, MockShiftPlan> = { [GHOST_1.id]: GHOST_1_PLAN };
    const entries = buildGhostEntries([GHOST_1], plans, TODAY);
    return entries[0].isGhost === true;
  })()
);

assert(
  'G6-3: ghostEntry uses ghostLabel as displayName',
  (() => {
    const plans: Record<string, MockShiftPlan> = { [GHOST_1.id]: GHOST_1_PLAN };
    const entries = buildGhostEntries([GHOST_1], plans, TODAY);
    return entries[0].memberDisplayName === GHOST_1.ghostLabel;
  })()
);

assert(
  'G6-4: ghostEntry code matches the plan entry code',
  (() => {
    const plans: Record<string, MockShiftPlan> = { [GHOST_1.id]: GHOST_1_PLAN };
    const entries = buildGhostEntries([GHOST_1], plans, TODAY);
    return entries[0].code === 'F';
  })()
);

assert(
  'G6-5: multiple ghosts with plans → multiple entries',
  (() => {
    const ghost2Plan: MockShiftPlan = {
      profileId: GHOST_2.id,
      startDateISO: TODAY,
      pattern: [],
      cycleLengthDays: 0,
      generatedUntilISO: TODAY,
      entries: [{ dateISO: TODAY, code: 'N' }],
    };
    const plans: Record<string, MockShiftPlan> = {
      [GHOST_1.id]: GHOST_1_PLAN,
      [GHOST_2.id]: ghost2Plan,
    };
    const entries = buildGhostEntries([GHOST_1, GHOST_2], plans, TODAY);
    return entries.length === 2;
  })()
);

// ─── Suite G7: Ghost absent from resolvedPlans ────────────────────────────────

console.log('\n  G7 – Ghost absent from resolvedPlans → no entry (no crash)');

assert(
  'G7-1: ghost with no plan → not in ghostEntries',
  (() => {
    const entries = buildGhostEntries([GHOST_1], {}, TODAY);
    return entries.length === 0;
  })()
);

assert(
  'G7-2: ghost plan exists but no entry for today → not in ghostEntries',
  (() => {
    const planForYesterday: MockShiftPlan = {
      profileId: GHOST_1.id,
      startDateISO: '2026-04-03',
      pattern: [],
      cycleLengthDays: 0,
      generatedUntilISO: '2026-04-03',
      entries: [{ dateISO: '2026-04-03', code: 'F' }], // different date
    };
    const entries = buildGhostEntries(
      [GHOST_1],
      { [GHOST_1.id]: planForYesterday },
      TODAY
    );
    return entries.length === 0;
  })()
);

assert(
  'G7-3: mix of ghosts with and without plans → only ghosts with plans appear',
  (() => {
    const plans: Record<string, MockShiftPlan> = { [GHOST_1.id]: GHOST_1_PLAN };
    // GHOST_2 has no plan
    const entries = buildGhostEntries([GHOST_1, GHOST_2], plans, TODAY);
    return (
      entries.length === 1 && entries[0].memberId === GHOST_1.id
    );
  })()
);

// ─── Suite G8: Ghost plan push decision ──────────────────────────────────────

console.log('\n  G8 – Ghost plan push decision after markGhostPresent');

assert(
  'G8-1: plan in resolvedPlans → plan returned for push',
  (() => {
    const plans: Record<string, MockShiftPlan> = { [GHOST_1.id]: GHOST_1_PLAN };
    const plan = getGhostPlanToPush(GHOST_1.id, plans);
    return plan !== null && plan.profileId === GHOST_1.id;
  })()
);

assert(
  'G8-2: plan absent from resolvedPlans → null (skip push, no crash)',
  (() => {
    const plan = getGhostPlanToPush(GHOST_1.id, {});
    return plan === null;
  })()
);

assert(
  'G8-3: push decision is per ghost ID — other ghosts not affected',
  (() => {
    const plans: Record<string, MockShiftPlan> = { [GHOST_1.id]: GHOST_1_PLAN };
    const planForGhost2 = getGhostPlanToPush(GHOST_2.id, plans);
    return planForGhost2 === null;
  })()
);

// ─── Suite G9: Ghost plan push null safety ────────────────────────────────────

console.log('\n  G9 – Ghost plan push null-safety');

assert(
  'G9-1: push with unknown ghost ID returns null (no throw)',
  (() => {
    try {
      const result = getGhostPlanToPush('nonexistent-id', {});
      return result === null;
    } catch {
      return false;
    }
  })()
);

// ─── Suite G10: Cross-device scenario ────────────────────────────────────────

console.log('\n  G10 – Cross-device scenario: Device A marks, Device B syncs');

assert(
  'G10-1: Device B has no ghosts locally → after mergeRemoteGhosts, ghost visible',
  (() => {
    // Device B starts with no local ghosts
    const deviceBLocal: MockGhost[] = [];
    // Backend has ghost pushed by Device A (host)
    const remoteGhosts: MockGhost[] = [GHOST_1];

    const merged = mergeRemoteGhosts(deviceBLocal, remoteGhosts);
    return merged.some((g) => g.id === GHOST_1.id && g.ghostStatus === 'active');
  })()
);

assert(
  'G10-2: Device B pull set now includes ghost ID after merge',
  (() => {
    const remoteGhosts: MockGhost[] = [GHOST_1];
    const merged = mergeRemoteGhosts([], remoteGhosts);
    const pullSet = buildPullSet([HOST_ID, GUEST_ID], merged);
    return pullSet.includes(GHOST_1.id);
  })()
);

assert(
  'G10-3: Device B sees ghost presence after pulling shift plan',
  (() => {
    // Simulate: after mergeRemoteGhosts, ghost in local list
    const ghosts: MockGhost[] = [GHOST_1];
    // Simulate: pullShiftPlansByProfileIds returned ghost plan
    const resolvedPlans: Record<string, MockShiftPlan> = {
      [GHOST_1.id]: GHOST_1_PLAN,
    };
    const entries = buildGhostEntries(ghosts, resolvedPlans, TODAY);
    return entries.length === 1 && entries[0].code === 'F';
  })()
);

assert(
  'G10-4: Device B does NOT see ghost presence when plan not yet pushed (pre-sync)',
  (() => {
    // Simulate: ghost definitions synced, but shift plan not yet in backend
    const ghosts: MockGhost[] = [GHOST_1];
    const resolvedPlans: Record<string, MockShiftPlan> = {}; // no ghost plan yet
    const entries = buildGhostEntries(ghosts, resolvedPlans, TODAY);
    return entries.length === 0; // not visible until plan is pushed and pulled
  })()
);

// ─── Suite G11: Deduplication ─────────────────────────────────────────────────

console.log('\n  G11 – Ghost entry deduplication');

assert(
  'G11-1: mergeRemoteGhosts produces exactly one entry per ghost ID',
  (() => {
    // Remote and local both have GHOST_1 (same id)
    const merged = mergeRemoteGhosts([GHOST_1], [GHOST_1]);
    return merged.filter((g) => g.id === GHOST_1.id).length === 1;
  })()
);

assert(
  'G11-2: pull set has no duplicate ghost IDs',
  (() => {
    const set = buildPullSet([HOST_ID], [GHOST_1, GHOST_1]); // duplicate ghost
    const ghostEntries = set.filter((id) => id === GHOST_1.id);
    return ghostEntries.length === 1;
  })()
);

// ─── Suite G12: Archived ghost exclusion ─────────────────────────────────────

console.log('\n  G12 – Archived ghost excluded from pull set and ghostEntries');

assert(
  'G12-1: archived ghost not in pull set',
  (() => {
    const set = buildPullSet([HOST_ID], [GHOST_1, GHOST_ARCHIVED]);
    return !set.includes(GHOST_ARCHIVED.id);
  })()
);

assert(
  'G12-2: archived ghost not in ghostEntries even if plan exists',
  (() => {
    const archivedPlan: MockShiftPlan = {
      profileId: GHOST_ARCHIVED.id,
      startDateISO: TODAY,
      pattern: [],
      cycleLengthDays: 0,
      generatedUntilISO: TODAY,
      entries: [{ dateISO: TODAY, code: 'F' }],
    };
    const plans: Record<string, MockShiftPlan> = {
      [GHOST_ARCHIVED.id]: archivedPlan,
    };
    const entries = buildGhostEntries([GHOST_ARCHIVED], plans, TODAY);
    return entries.length === 0;
  })()
);

assert(
  'G12-3: mergeRemoteGhosts can carry archived status (archive propagates)',
  (() => {
    const localActive: MockGhost = { ...GHOST_1, ghostStatus: 'active' };
    const remoteArchived: MockGhost = { ...GHOST_1, ghostStatus: 'archived' };
    const merged = mergeRemoteGhosts([localActive], [remoteArchived]);
    const ghost = merged.find((g) => g.id === GHOST_1.id);
    // After host archives on their device + pushes, other devices see archived status
    return ghost?.ghostStatus === 'archived';
  })()
);

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) {
  console.error('FEHLGESCHLAGEN:', failedLabels);
  process.exit(1);
}
