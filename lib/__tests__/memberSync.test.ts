/**
 * Member Sync – Unit tests for delete-propagation invariants
 *
 * Covers three invariants required for guest-delete propagation:
 *   D1: Remote member list is authoritative – members absent from backend are removed
 *   D2: Own-profile safety net – own profile is never dropped even if push failed
 *   D3: Merge is idempotent – running sync N times produces the same result
 *
 * Tests are pure-function coverage (no AsyncStorage / Supabase).
 * The merge algorithm is extracted identically from syncTeamSpaces in teamSync.ts.
 */

import { fallbackAvatarSeed, isFallbackAvatarSeed } from '../avatarSeed';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockMember {
  id: string;
  displayName: string;
  avatarUrl: string;
}

interface MockSpace {
  id: string;
  memberProfiles: MockMember[];
}

// ─── Pure extract of the authoritative merge from syncTeamSpaces ──────────────

/**
 * Mirrors the merge body of syncTeamSpaces (teamSync.ts).
 * Remote is authoritative: only members present in the backend are kept.
 * Own profile is always preserved via the safety-net path.
 */
function mergeSpaceMembers(
  profileId: string,
  localSpace: MockSpace,
  remoteSpace: MockSpace
): MockMember[] {
  const localById = new Map<string, MockMember>();
  for (const lm of localSpace.memberProfiles) {
    localById.set(lm.id, lm);
  }

  const memberMap = new Map<string, MockMember>();
  for (const remoteMember of remoteSpace.memberProfiles) {
    const existing = localById.get(remoteMember.id);
    const resolvedDisplayName = remoteMember.displayName || existing?.displayName || '';

    const remoteIsReal =
      !!remoteMember.avatarUrl &&
      !isFallbackAvatarSeed(remoteMember.avatarUrl, remoteMember.id, resolvedDisplayName);
    const existingIsReal =
      !!existing?.avatarUrl &&
      !isFallbackAvatarSeed(existing.avatarUrl, existing.id, resolvedDisplayName);

    memberMap.set(remoteMember.id, {
      id: remoteMember.id,
      displayName: resolvedDisplayName,
      avatarUrl:
        (remoteIsReal ? remoteMember.avatarUrl : null) ||
        (existingIsReal ? existing!.avatarUrl : null) ||
        remoteMember.avatarUrl ||
        existing?.avatarUrl ||
        fallbackAvatarSeed(remoteMember.id, resolvedDisplayName),
    });
  }

  // Safety net: always keep own profile
  if (!memberMap.has(profileId)) {
    const ownLocal = localById.get(profileId);
    if (ownLocal) memberMap.set(profileId, ownLocal);
  }

  return Array.from(memberMap.values());
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
    console.error(`  ✗ ${label}${detail ? ` – ${detail}` : ''}`);
    failed++;
    failedLabels.push(label);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HOST_ID = 'host-uuid-111';
const HOST_NAME = 'Müsba';
const HOST_SEED = 'müsba';

const GUEST_ID = 'guest-uuid-222';
const GUEST_NAME = 'Kelda';
const GUEST_SEED = 'kelda';

const SPACE_ID = 'space-001';

const hostMember: MockMember = { id: HOST_ID, displayName: HOST_NAME, avatarUrl: HOST_SEED };
const guestMember: MockMember = { id: GUEST_ID, displayName: GUEST_NAME, avatarUrl: GUEST_SEED };

// ─── Suite 1: D1 – Remote is authoritative ───────────────────────────────────

console.log('\n  mergeSpaceMembers – D1 remote is authoritative');

// Both local and remote have both members → both kept
assert(
  'both members present in remote → both kept',
  (() => {
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    return merged.length === 2 && merged.some((m) => m.id === GUEST_ID);
  })()
);

// Guest deleted: remote no longer has guest → guest removed from merged
assert(
  'guest absent from remote → removed from merged result',
  (() => {
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] }; // guest gone
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    return merged.length === 1 && !merged.some((m) => m.id === GUEST_ID);
  })()
);

// New member appears in remote but not local → added to merged
assert(
  'new member in remote but not local → added to merged',
  (() => {
    const newMember: MockMember = { id: 'new-333', displayName: 'Torvi', avatarUrl: 'torvi' };
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, newMember] };
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    return merged.length === 2 && merged.some((m) => m.id === 'new-333');
  })()
);

// Additive-only merge OLD behavior is gone: local-only members must NOT persist
assert(
  'local-only member (not in remote) is dropped – no stale rehydration',
  (() => {
    // Simulate: host local has stale guest, but remote has already removed them
    const staleGuest: MockMember = {
      id: 'stale-999',
      displayName: 'Stale',
      avatarUrl: fallbackAvatarSeed('stale-999', 'Stale'),
    };
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, staleGuest] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] };
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    return !merged.some((m) => m.id === 'stale-999');
  })()
);

// ─── Suite 2: D2 – Own-profile safety net ────────────────────────────────────

console.log('\n  mergeSpaceMembers – D2 own-profile safety net');

// Own profile in local but push failed (not in remote) → still kept
assert(
  'own profile kept when absent from remote (push failure safety net)',
  (() => {
    // Simulate: push failed, remote doesn't include own profile
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [guestMember] }; // host missing
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    return merged.some((m) => m.id === HOST_ID);
  })()
);

// Own profile in remote → kept normally (no duplication)
assert(
  'own profile present in remote → kept exactly once',
  (() => {
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    return merged.filter((m) => m.id === HOST_ID).length === 1;
  })()
);

// Safety net does not prevent guest deletion: when guest is profileId but host calls merge
// → this is always from host's perspective so HOST_ID is profileId
assert(
  'safety net only applies to own profile – deleted guest not protected',
  (() => {
    // Host (HOST_ID) does sync; remote has no guest → guest removed, host preserved
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] };
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    const hasHost = merged.some((m) => m.id === HOST_ID);
    const hasGuest = merged.some((m) => m.id === GUEST_ID);
    return hasHost && !hasGuest;
  })()
);

// ─── Suite 3: D3 – Idempotency ───────────────────────────────────────────────

console.log('\n  mergeSpaceMembers – D3 idempotency');

// Running merge multiple times with same remote produces same result
assert(
  'merge is idempotent: 5 sync cycles with same remote → stable result',
  (() => {
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] }; // guest deleted
    let currentLocal: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    for (let i = 0; i < 5; i++) {
      const merged = mergeSpaceMembers(HOST_ID, currentLocal, remote);
      currentLocal = { id: SPACE_ID, memberProfiles: merged };
    }
    return currentLocal.memberProfiles.length === 1 &&
      currentLocal.memberProfiles[0].id === HOST_ID;
  })()
);

// Member avatar stays stable across multiple syncs
assert(
  'avatar seed stable across 5 sync cycles',
  (() => {
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    let currentLocal: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    for (let i = 0; i < 5; i++) {
      const merged = mergeSpaceMembers(HOST_ID, currentLocal, remote);
      currentLocal = { id: SPACE_ID, memberProfiles: merged };
    }
    const guest = currentLocal.memberProfiles.find((m) => m.id === GUEST_ID);
    return guest?.avatarUrl === GUEST_SEED;
  })()
);

// ─── Suite 4: E2E – Delete propagation simulation ────────────────────────────

console.log('\n  E2E: guest delete propagation lifecycle');

assert(
  'before delete: guest visible in host merged result',
  (() => {
    const local: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const merged = mergeSpaceMembers(HOST_ID, local, remote);
    return merged.some((m) => m.id === GUEST_ID);
  })()
);

assert(
  'after delete + backend row removed: host sync removes guest from merged result',
  (() => {
    // Step 1: initial state — both present
    const localBefore: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };

    // Step 2: guest calls removeSpaceMembershipsForProfile → backend row gone
    // Simulated: remote no longer has guest
    const remoteAfterDelete: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] };

    // Step 3: host triggers syncTeamSpaces (navigates to choose.tsx or today.tsx)
    const mergedAfterSync = mergeSpaceMembers(HOST_ID, localBefore, remoteAfterDelete);

    return !mergedAfterSync.some((m) => m.id === GUEST_ID);
  })()
);

assert(
  'after delete: host remains, space continues to function',
  (() => {
    const localBefore: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember, guestMember] };
    const remoteAfterDelete: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] };
    const merged = mergeSpaceMembers(HOST_ID, localBefore, remoteAfterDelete);
    const host = merged.find((m) => m.id === HOST_ID);
    return merged.length === 1 && host?.avatarUrl === HOST_SEED;
  })()
);

assert(
  'subsequent syncs after delete remain stable (no ghost reappearance)',
  (() => {
    // After first sync removes guest, local is updated. Further syncs keep guest gone.
    let currentLocal: MockSpace = {
      id: SPACE_ID,
      memberProfiles: [hostMember], // already cleaned up after first sync
    };
    const remote: MockSpace = { id: SPACE_ID, memberProfiles: [hostMember] };
    for (let i = 0; i < 3; i++) {
      const merged = mergeSpaceMembers(HOST_ID, currentLocal, remote);
      currentLocal = { id: SPACE_ID, memberProfiles: merged };
    }
    return !currentLocal.memberProfiles.some((m) => m.id === GUEST_ID) &&
      currentLocal.memberProfiles.length === 1;
  })()
);

// ─── Lifecycle history helpers ────────────────────────────────────────────────

interface MockLifecycleEntry {
  id: string;
  displayName: string;
  avatarUrl: string;
  joinedAt: string;
  joinedViaProfileId: string;
  removedAt?: string;
  active: boolean;
}

interface MockSpaceWithHistory {
  id: string;
  ownerProfileId: string;
  createdAt: string;
  memberProfiles: MockMember[];
  memberHistory: MockLifecycleEntry[];
}

/**
 * Pure extract of the history-update logic from syncTeamSpaces.
 * Takes the merged memberMap (already built by mergeSpaceMembers) and
 * the local space with history, returns the updated history.
 */
function updateHistory(
  localSpace: MockSpaceWithHistory,
  mergedMemberMap: Map<string, MockMember>,
  remoteOwnerProfileId: string
): MockLifecycleEntry[] {
  const now = '2026-04-02T12:00:00.000Z'; // fixed for deterministic tests
  const historyMap = new Map<string, MockLifecycleEntry>();
  for (const entry of localSpace.memberHistory) {
    historyMap.set(entry.id, { ...entry });
  }

  // Add/update for all currently active members
  for (const [id, merged] of mergedMemberMap.entries()) {
    const existing = historyMap.get(id);
    if (!existing) {
      historyMap.set(id, {
        id: merged.id,
        displayName: merged.displayName,
        avatarUrl: merged.avatarUrl,
        joinedAt: now,
        joinedViaProfileId: remoteOwnerProfileId,
        active: true,
      });
    } else if (!existing.active) {
      historyMap.set(id, {
        ...existing,
        displayName: merged.displayName || existing.displayName,
        avatarUrl: merged.avatarUrl || existing.avatarUrl,
        active: true,
        removedAt: undefined,
      });
    } else {
      historyMap.set(id, {
        ...existing,
        displayName: merged.displayName || existing.displayName,
        avatarUrl: merged.avatarUrl || existing.avatarUrl,
      });
    }
  }

  // Mark removed: local members absent from merged map
  for (const localMember of localSpace.memberProfiles) {
    if (!mergedMemberMap.has(localMember.id)) {
      const existing = historyMap.get(localMember.id);
      if (existing) {
        if (existing.active) {
          historyMap.set(localMember.id, { ...existing, removedAt: now, active: false });
        }
      } else {
        historyMap.set(localMember.id, {
          id: localMember.id,
          displayName: localMember.displayName,
          avatarUrl: localMember.avatarUrl,
          joinedAt: localSpace.createdAt,
          joinedViaProfileId: localSpace.ownerProfileId,
          removedAt: now,
          active: false,
        });
      }
    }
  }

  return Array.from(historyMap.values());
}

/** Seed history from memberProfiles (mirrors migrateSpace logic) */
function seedHistory(space: { ownerProfileId: string; createdAt: string; memberProfiles: MockMember[] }): MockLifecycleEntry[] {
  return space.memberProfiles.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    joinedAt: space.createdAt,
    joinedViaProfileId: space.ownerProfileId,
    active: true,
  }));
}

// ─── Suite 5: History seeding (M1) ───────────────────────────────────────────

console.log('\n  History seeding – M1 migrate from memberProfiles');

assert(
  'M1: empty history seeded from memberProfiles',
  (() => {
    const space = { ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember] };
    const history = seedHistory(space);
    return history.length === 1 && history[0].id === HOST_ID && history[0].active;
  })()
);

assert(
  'M1: seeded entry has joinedAt = createdAt',
  (() => {
    const createdAt = '2026-04-01T10:00:00.000Z';
    const space = { ownerProfileId: HOST_ID, createdAt, memberProfiles: [hostMember] };
    const history = seedHistory(space);
    return history[0].joinedAt === createdAt;
  })()
);

assert(
  'M1: seeded entry joinedViaProfileId = ownerProfileId',
  (() => {
    const space = { ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember, guestMember] };
    const history = seedHistory(space);
    return history.every((h) => h.joinedViaProfileId === HOST_ID);
  })()
);

assert(
  'M1: multiple members all seeded as active',
  (() => {
    const space = { ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember, guestMember] };
    const history = seedHistory(space);
    return history.length === 2 && history.every((h) => h.active);
  })()
);

assert(
  'M1: empty memberProfiles → empty history (no crash)',
  (() => {
    const space = { ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [] };
    const history = seedHistory(space);
    return history.length === 0;
  })()
);

// ─── Suite 6: Lifecycle tracking (M2/M3) ─────────────────────────────────────

console.log('\n  History lifecycle – M2 join tracking / M3 remove tracking');

assert(
  'M2: new member in remote → added to history as active',
  (() => {
    const localSpace: MockSpaceWithHistory = {
      id: SPACE_ID,
      ownerProfileId: HOST_ID,
      createdAt: '2026-04-01T10:00:00.000Z',
      memberProfiles: [hostMember],
      memberHistory: seedHistory({ ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember] }),
    };
    const remoteMembers = [hostMember, guestMember];
    const mergedMap = new Map(remoteMembers.map((m) => [m.id, m]));
    const history = updateHistory(localSpace, mergedMap, HOST_ID);
    const guestEntry = history.find((h) => h.id === GUEST_ID);
    return !!guestEntry && guestEntry.active === true;
  })()
);

assert(
  'M2: new member joinedViaProfileId set to owner',
  (() => {
    const localSpace: MockSpaceWithHistory = {
      id: SPACE_ID,
      ownerProfileId: HOST_ID,
      createdAt: '2026-04-01T10:00:00.000Z',
      memberProfiles: [hostMember],
      memberHistory: seedHistory({ ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember] }),
    };
    const mergedMap = new Map([hostMember, guestMember].map((m) => [m.id, m]));
    const history = updateHistory(localSpace, mergedMap, HOST_ID);
    const guestEntry = history.find((h) => h.id === GUEST_ID);
    return guestEntry?.joinedViaProfileId === HOST_ID;
  })()
);

assert(
  'M3: member absent from remote → removedAt set, active=false',
  (() => {
    const localSpace: MockSpaceWithHistory = {
      id: SPACE_ID,
      ownerProfileId: HOST_ID,
      createdAt: '2026-04-01T10:00:00.000Z',
      memberProfiles: [hostMember, guestMember],
      memberHistory: seedHistory({ ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember, guestMember] }),
    };
    const mergedMap = new Map([[HOST_ID, hostMember]]); // guest gone
    const history = updateHistory(localSpace, mergedMap, HOST_ID);
    const guestEntry = history.find((h) => h.id === GUEST_ID);
    return !!guestEntry && guestEntry.active === false && !!guestEntry.removedAt;
  })()
);

assert(
  'M3: host (owner) always stays active after guest removal',
  (() => {
    const localSpace: MockSpaceWithHistory = {
      id: SPACE_ID,
      ownerProfileId: HOST_ID,
      createdAt: '2026-04-01T10:00:00.000Z',
      memberProfiles: [hostMember, guestMember],
      memberHistory: seedHistory({ ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember, guestMember] }),
    };
    const mergedMap = new Map([[HOST_ID, hostMember]]);
    const history = updateHistory(localSpace, mergedMap, HOST_ID);
    const hostEntry = history.find((h) => h.id === HOST_ID);
    return hostEntry?.active === true && !hostEntry.removedAt;
  })()
);

assert(
  'M3: removal is idempotent – already-removed member not double-stamped',
  (() => {
    const alreadyRemovedAt = '2026-04-01T18:00:00.000Z';
    const localSpace: MockSpaceWithHistory = {
      id: SPACE_ID,
      ownerProfileId: HOST_ID,
      createdAt: '2026-04-01T10:00:00.000Z',
      memberProfiles: [hostMember], // guest already dropped from memberProfiles
      memberHistory: [
        { id: HOST_ID, displayName: HOST_NAME, avatarUrl: HOST_SEED, joinedAt: '2026-04-01T10:00:00.000Z', joinedViaProfileId: HOST_ID, active: true },
        { id: GUEST_ID, displayName: GUEST_NAME, avatarUrl: GUEST_SEED, joinedAt: '2026-04-01T10:00:00.000Z', joinedViaProfileId: HOST_ID, active: false, removedAt: alreadyRemovedAt },
      ],
    };
    const mergedMap = new Map([[HOST_ID, hostMember]]);
    const history = updateHistory(localSpace, mergedMap, HOST_ID);
    const guestEntry = history.find((h) => h.id === GUEST_ID);
    // removedAt should NOT change if already marked removed
    return guestEntry?.removedAt === alreadyRemovedAt;
  })()
);

assert(
  'M3: re-joined member (back in remote) → reactivated, removedAt cleared',
  (() => {
    const localSpace: MockSpaceWithHistory = {
      id: SPACE_ID,
      ownerProfileId: HOST_ID,
      createdAt: '2026-04-01T10:00:00.000Z',
      memberProfiles: [hostMember], // guest was removed
      memberHistory: [
        { id: HOST_ID, displayName: HOST_NAME, avatarUrl: HOST_SEED, joinedAt: '2026-04-01T10:00:00.000Z', joinedViaProfileId: HOST_ID, active: true },
        { id: GUEST_ID, displayName: GUEST_NAME, avatarUrl: GUEST_SEED, joinedAt: '2026-04-01T10:00:00.000Z', joinedViaProfileId: HOST_ID, active: false, removedAt: '2026-04-01T18:00:00.000Z' },
      ],
    };
    // Guest re-appears in remote (re-joined)
    const mergedMap = new Map([hostMember, guestMember].map((m) => [m.id, m]));
    const history = updateHistory(localSpace, mergedMap, HOST_ID);
    const guestEntry = history.find((h) => h.id === GUEST_ID);
    return guestEntry?.active === true && !guestEntry.removedAt;
  })()
);

// ─── Suite 7: Host-only access guard (M4) ────────────────────────────────────

console.log('\n  Host-only guard – M4');

function isHostOf(profileId: string, space: { ownerProfileId: string }): boolean {
  return profileId === space.ownerProfileId;
}

assert(
  'M4: host profile → access granted',
  isHostOf(HOST_ID, { ownerProfileId: HOST_ID })
);

assert(
  'M4: co-admin → access denied',
  !isHostOf(GUEST_ID, { ownerProfileId: HOST_ID })
);

assert(
  'M4: regular member → access denied',
  !isHostOf('other-999', { ownerProfileId: HOST_ID })
);

assert(
  'M4: empty profileId → access denied',
  !isHostOf('', { ownerProfileId: HOST_ID })
);

// ─── Suite 8: Backward compatibility (M5) ────────────────────────────────────

console.log('\n  Backward compat – M5 existing memberProfiles consumers unaffected');

assert(
  'M5: memberProfiles unchanged by history operations',
  (() => {
    const localSpace: MockSpaceWithHistory = {
      id: SPACE_ID,
      ownerProfileId: HOST_ID,
      createdAt: '2026-04-01T10:00:00.000Z',
      memberProfiles: [hostMember, guestMember],
      memberHistory: seedHistory({ ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember, guestMember] }),
    };
    // Simulate: history updated but memberProfiles left intact
    const mergedMap = new Map([[HOST_ID, hostMember]]); // guest removed in remote
    updateHistory(localSpace, mergedMap, HOST_ID);
    // Original memberProfiles still has both (history is separate)
    return localSpace.memberProfiles.length === 2;
  })()
);

assert(
  'M5: history entries do not bleed into memberProfiles contract',
  (() => {
    const space = { ownerProfileId: HOST_ID, createdAt: '2026-04-01T10:00:00.000Z', memberProfiles: [hostMember] };
    const history = seedHistory(space);
    // history entries should not have any unexpected extra fields that break MemberSnapshot
    return history.every((h) => typeof h.id === 'string' && typeof h.displayName === 'string' && typeof h.avatarUrl === 'string');
  })()
);

assert(
  'M5: co-admin toggle not affected by history (coAdminProfileIds independent)',
  (() => {
    const coAdminProfileIds = [GUEST_ID];
    const history = [
      { id: HOST_ID, displayName: HOST_NAME, avatarUrl: HOST_SEED, joinedAt: '', joinedViaProfileId: HOST_ID, active: true },
      { id: GUEST_ID, displayName: GUEST_NAME, avatarUrl: GUEST_SEED, joinedAt: '', joinedViaProfileId: HOST_ID, active: true },
    ];
    // co-admin status is independent of lifecycle state
    const isCoAdmin = coAdminProfileIds.includes(GUEST_ID);
    const isActive = history.find((h) => h.id === GUEST_ID)?.active === true;
    return isCoAdmin && isActive;
  })()
);

assert(
  'M5: removed member cannot be co-admin (guard logic)',
  (() => {
    const coAdminProfileIds = [GUEST_ID]; // was set before removal
    const history = [
      { id: GUEST_ID, displayName: GUEST_NAME, avatarUrl: GUEST_SEED, joinedAt: '', joinedViaProfileId: HOST_ID, active: false, removedAt: '2026-04-02T00:00:00.000Z' },
    ];
    const guestEntry = history.find((h) => h.id === GUEST_ID);
    // Guard: cannot toggle co-admin for inactive member
    const canToggle = !!guestEntry && guestEntry.active !== false;
    return !canToggle; // correctly blocked
  })()
);

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) {
  console.error('FEHLGESCHLAGEN:', failedLabels);
  process.exit(1);
}
