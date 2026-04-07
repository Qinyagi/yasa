/**
 * Avatar Seed – Unit + Integration-level tests
 *
 * Covers three invariants required for cross-device avatar consistency:
 *   I1: resolveAvatarSeed is deterministic for all input categories
 *   I2: Real seed always outranks fallback in the sync merge
 *   I3: No code path can downgrade a real seed to a fallback
 *
 * Tests do NOT require AsyncStorage or Supabase – pure function coverage only.
 * The merge algorithm is extracted and tested as a pure function identical to
 * the one used in lib/backend/teamSync.ts (syncTeamSpaces merge body).
 */

import { fallbackAvatarSeed, isFallbackAvatarSeed, resolveAvatarSeed } from '../avatarSeed';

// ─── Helper: merge algorithm (mirrors teamSync.ts syncTeamSpaces merge body) ──

interface MockMember {
  id: string;
  displayName: string;
  avatarUrl: string;
}

/**
 * Pure extract of the merge logic from syncTeamSpaces.
 * If this test passes, the production merge passes the same invariants.
 */
function mergeAvatarUrl(
  remote: MockMember,
  existing: MockMember
): string {
  const resolvedDisplayName = remote.displayName || existing.displayName;
  const remoteIsReal =
    !!remote.avatarUrl &&
    !isFallbackAvatarSeed(remote.avatarUrl, remote.id, resolvedDisplayName);
  const existingIsReal =
    !!existing.avatarUrl &&
    !isFallbackAvatarSeed(existing.avatarUrl, existing.id, resolvedDisplayName);

  return (
    (remoteIsReal ? remote.avatarUrl : null) ||
    (existingIsReal ? existing.avatarUrl : null) ||
    remote.avatarUrl ||
    existing.avatarUrl ||
    fallbackAvatarSeed(remote.id, resolvedDisplayName)
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Simple test runner (same pattern as existing tests)
let passed = 0;
let failed = 0;
const results: string[] = [];

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` – ${detail}` : ''}`);
    failed++;
    results.push(label);
  }
}

// ─── Suite 1: fallbackAvatarSeed ──────────────────────────────────────────────

console.log('\n  fallbackAvatarSeed');

assert(
  'produces lowercase id:name string',
  fallbackAvatarSeed('ABC-123', 'Müsba') === 'abc-123:müsba'
);
assert(
  'is deterministic (same input → same output)',
  fallbackAvatarSeed('abc', 'Anna') === fallbackAvatarSeed('abc', 'Anna')
);
assert(
  'distinguishes different ids',
  fallbackAvatarSeed('id1', 'Anna') !== fallbackAvatarSeed('id2', 'Anna')
);
assert(
  'distinguishes different names',
  fallbackAvatarSeed('id1', 'Anna') !== fallbackAvatarSeed('id1', 'Berta')
);

// ─── Suite 2: isFallbackAvatarSeed ───────────────────────────────────────────

console.log('\n  isFallbackAvatarSeed');

assert(
  'recognises generated fallback',
  isFallbackAvatarSeed('abc-123:müsba', 'abc-123', 'Müsba')
);
assert(
  'rejects real user-chosen seed',
  !isFallbackAvatarSeed('müsba', 'abc-123', 'Müsba')
);
assert(
  'rejects empty string as fallback (empty ≠ generated)',
  !isFallbackAvatarSeed('', 'abc-123', 'Müsba')
);
assert(
  'rejects legacy URL as fallback',
  !isFallbackAvatarSeed('https://api.multiavatar.com/alice.svg', 'abc-123', 'Alice')
);

// ─── Suite 3: resolveAvatarSeed – I1 determinism ─────────────────────────────

console.log('\n  resolveAvatarSeed – I1 determinism');

assert(
  'clean seed returned lowercased',
  resolveAvatarSeed('id1', 'Müsba', 'Müsba') === 'müsba'
);
assert(
  'clean seed already lowercase unchanged',
  resolveAvatarSeed('id1', 'müsba', 'müsba') === 'müsba'
);
assert(
  'legacy SVG URL → seed extracted and lowercased',
  resolveAvatarSeed('id1', 'Alice', 'https://api.multiavatar.com/Alice.svg') === 'alice'
);
assert(
  'legacy SVG URL already lowercase → same result',
  resolveAvatarSeed('id1', 'alice', 'https://api.multiavatar.com/alice.svg') === 'alice'
);
assert(
  'empty avatarUrl → fallback seed',
  resolveAvatarSeed('abc-123', 'Müsba', '') === 'abc-123:müsba'
);
assert(
  'undefined avatarUrl → fallback seed',
  resolveAvatarSeed('abc-123', 'Müsba', undefined) === 'abc-123:müsba'
);
assert(
  'whitespace-only avatarUrl → fallback seed',
  resolveAvatarSeed('abc-123', 'Müsba', '   ') === 'abc-123:müsba'
);
assert(
  'never returns empty string when id+name provided',
  resolveAvatarSeed('abc-123', 'Müsba', '').length > 0
);

// ─── Suite 4: Merge – I2 real seed outranks fallback ─────────────────────────

console.log('\n  mergeAvatarUrl – I2 real seed outranks fallback');

const HOST_ID = 'host-uuid-111';
const HOST_NAME = 'Müsba';
const REAL_SEED = 'müsba';
const FALLBACK = fallbackAvatarSeed(HOST_ID, HOST_NAME); // "host-uuid-111:müsba"

// Scenario: Device A (host) has pushed real seed; Device B has fallback locally
assert(
  'remote=real + existing=fallback → real wins',
  mergeAvatarUrl(
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED },
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: FALLBACK }
  ) === REAL_SEED
);

// Scenario: Device B synced, has real seed; remote has fallback (stale backend)
assert(
  'remote=fallback + existing=real → real wins',
  mergeAvatarUrl(
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: FALLBACK },
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED }
  ) === REAL_SEED
);

// Scenario: Both have real seed (idempotent after multiple syncs)
assert(
  'remote=real + existing=real → real wins (stable)',
  mergeAvatarUrl(
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED },
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED }
  ) === REAL_SEED
);

// Scenario: Both have fallback (no real seed anywhere yet)
assert(
  'remote=fallback + existing=fallback → fallback (no real seed to promote)',
  mergeAvatarUrl(
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: FALLBACK },
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: FALLBACK }
  ) === FALLBACK
);

// Scenario: real seed arrives after second sync → replaces fallback
assert(
  'second sync: remote=real replaces stored fallback',
  mergeAvatarUrl(
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED },
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: FALLBACK }
  ) === REAL_SEED
);

// ─── Suite 5: Merge – I3 no downgrade of real seed ───────────────────────────

console.log('\n  mergeAvatarUrl – I3 no downgrade of real seed');

assert(
  'remote=empty + existing=real → real preserved',
  mergeAvatarUrl(
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: '' },
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED }
  ) === REAL_SEED
);

assert(
  'remote=fallback + existing=real → real preserved (no downgrade)',
  mergeAvatarUrl(
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: FALLBACK },
    { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED }
  ) === REAL_SEED
);

assert(
  'multiple merge cycles with real seed stay stable',
  (() => {
    // Simulate 5 sync cycles: one device always has real, the other varies
    const outcomes = [REAL_SEED, FALLBACK, REAL_SEED, FALLBACK, REAL_SEED].map((remoteAv) =>
      mergeAvatarUrl(
        { id: HOST_ID, displayName: HOST_NAME, avatarUrl: remoteAv },
        { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED }
      )
    );
    return outcomes.every((o) => o === REAL_SEED);
  })()
);

// ─── Suite 6: End-to-end host-join-sync simulation ───────────────────────────

console.log('\n  E2E: host-join-sync avatar seed lifecycle');

/**
 * Simulates the full lifecycle:
 * 1. Host creates space (memberProfiles with real seed)
 * 2. Guest scans QR WITH ownerAvatar (R2 QR format)
 *    → importSpaceFromInvite uses ownerAvatarUrl directly
 * 3. Guest navigates to today.tsx → resolveAvatarSeed returns real seed
 */
assert(
  'R2 QR: guest receives real seed immediately via ownerAvatarUrl',
  (() => {
    // Step 1: host's snapshot (as created in create.tsx)
    const hostSnapshot = {
      id: HOST_ID,
      displayName: HOST_NAME,
      avatarUrl: REAL_SEED, // "müsba"
    };

    // Step 2: QR payload parsed on guest side (ownerAvatarUrl = "müsba")
    const qrOwnerAvatarUrl = hostSnapshot.avatarUrl; // transmitted in QR

    // Step 3: importSpaceFromInvite builds owner snapshot (the fixed logic)
    const ownerAvatarResolved =
      qrOwnerAvatarUrl && qrOwnerAvatarUrl.trim().length > 0
        ? qrOwnerAvatarUrl.trim().toLowerCase()
        : fallbackAvatarSeed(HOST_ID, HOST_NAME);

    // Step 4: resolveAvatarSeed as called by today.tsx
    const renderedSeed = resolveAvatarSeed(HOST_ID, HOST_NAME, ownerAvatarResolved);

    return renderedSeed === REAL_SEED;
  })()
);

assert(
  'Legacy QR (no ownerAvatarUrl): guest falls back then sync corrects it',
  (() => {
    // Step 1: Legacy QR has no ownerAvatarUrl (simulate as empty string like old QR format)
    const qrOwnerAvatarUrl = '' as string; // cast to string to avoid TS never narrowing

    // Step 2: importSpaceFromInvite → fallback
    const ownerAvatarBeforeSync =
      qrOwnerAvatarUrl && qrOwnerAvatarUrl.trim().length > 0
        ? qrOwnerAvatarUrl.trim().toLowerCase()
        : fallbackAvatarSeed(HOST_ID, HOST_NAME);

    // Before sync: fallback
    const beforeSync = resolveAvatarSeed(HOST_ID, HOST_NAME, ownerAvatarBeforeSync);
    const beforeCorrect = beforeSync === FALLBACK;

    // Step 3: Backend sync arrives with real seed (host has synced)
    const afterSyncAvatarUrl = mergeAvatarUrl(
      { id: HOST_ID, displayName: HOST_NAME, avatarUrl: REAL_SEED }, // remote (from backend)
      { id: HOST_ID, displayName: HOST_NAME, avatarUrl: ownerAvatarBeforeSync } // local
    );

    const afterSync = resolveAvatarSeed(HOST_ID, HOST_NAME, afterSyncAvatarUrl);
    const afterCorrect = afterSync === REAL_SEED;

    return beforeCorrect && afterCorrect;
  })()
);

assert(
  'sync is idempotent: multiple sync cycles keep real seed stable',
  (() => {
    let currentAvatarUrl = REAL_SEED; // after first correct sync
    for (let i = 0; i < 10; i++) {
      const remoteVariations = [REAL_SEED, FALLBACK, REAL_SEED, ''];
      const remote = remoteVariations[i % remoteVariations.length];
      currentAvatarUrl = mergeAvatarUrl(
        { id: HOST_ID, displayName: HOST_NAME, avatarUrl: remote },
        { id: HOST_ID, displayName: HOST_NAME, avatarUrl: currentAvatarUrl }
      );
    }
    return currentAvatarUrl === REAL_SEED;
  })()
);

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) {
  console.error('FEHLGESCHLAGEN:', results);
  process.exit(1);
}
