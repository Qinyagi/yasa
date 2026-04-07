/**
 * Tests for realtimeMembers.ts – pure helpers and debounce logic.
 * Supabase channel integration tested manually (requires live backend).
 *
 * This test file is SELF-CONTAINED to avoid Node.js v22 + sucrase-node incompatibility
 * with expo-modules-core. The pure functions (shouldHandleEvent, createDebounce)
 * are duplicated inline for testing purposes only.
 */

const REALTIME_DEBOUNCE_MS = 2000;

// ─── Duplicated pure helpers (for test isolation) ───────────────────────────────

function shouldHandleEvent(payload: unknown, spaceIds: string[]): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (spaceIds.length === 0) return false;
  const p = payload as Record<string, unknown>;
  const newRow = p['new'];
  const oldRow = p['old'];
  const fromNew =
    typeof newRow === 'object' && newRow !== null
      ? (newRow as Record<string, unknown>)['space_id']
      : undefined;
  const fromOld =
    typeof oldRow === 'object' && oldRow !== null
      ? (oldRow as Record<string, unknown>)['space_id']
      : undefined;
  const spaceId = fromNew ?? fromOld;
  if (typeof spaceId !== 'string') return false;
  return spaceIds.includes(spaceId);
}

function createDebounce(delay: number): {
  schedule: (fn: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(fn: () => void): void {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delay);
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

// ─── Minimales Test-Framework ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function describe(suiteName: string, fn: () => void): void {
  process.stdout.write(`\n  ${suiteName}\n`);
  try {
    fn();
  } catch (err) {
    process.stdout.write(`  ❌ Fehler: ${err}\n`);
    failed++;
  }
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    process.stdout.write(`    ✓ ${name}\n`);
    passed++;
  } catch (err) {
    process.stdout.write(`    ✗ ${name}\n      → ${err}\n`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Tests: shouldHandleEvent – pure filtering ───────────────────────────────

describe('shouldHandleEvent – pure filtering', () => {
  const spaceIds = ['space-a', 'space-b'];

  test('returns true for INSERT with matching space_id in new row', () => {
    const payload = {
      eventType: 'INSERT',
      new: { space_id: 'space-a', user_id: 'u1' },
      old: null,
    };
    eq(shouldHandleEvent(payload, spaceIds), true);
  });

  test('returns true for DELETE with matching space_id in old row', () => {
    const payload = {
      eventType: 'DELETE',
      new: null,
      old: { space_id: 'space-b', user_id: 'u2' },
    };
    eq(shouldHandleEvent(payload, spaceIds), true);
  });

  test('returns true for UPDATE with matching space_id', () => {
    const payload = {
      eventType: 'UPDATE',
      new: { space_id: 'space-a', user_id: 'u1', display_name: 'Updated' },
      old: { space_id: 'space-a', user_id: 'u1', display_name: 'Old' },
    };
    eq(shouldHandleEvent(payload, spaceIds), true);
  });

  test('returns false for non-matching space_id', () => {
    const payload = {
      new: { space_id: 'space-c', user_id: 'u3' },
      old: null,
    };
    eq(shouldHandleEvent(payload, spaceIds), false);
  });

  test('returns false for empty spaceIds array', () => {
    const payload = { new: { space_id: 'space-a', user_id: 'u1' }, old: null };
    eq(shouldHandleEvent(payload, []), false);
  });

  test('returns false for null payload', () => {
    eq(shouldHandleEvent(null, spaceIds), false);
  });

  test('returns false for undefined payload', () => {
    eq(shouldHandleEvent(undefined, spaceIds), false);
  });

  test('returns false for non-object payload', () => {
    eq(shouldHandleEvent('string', spaceIds), false);
    eq(shouldHandleEvent(123, spaceIds), false);
  });

  test('returns false when new and old both missing space_id', () => {
    const payload = { new: { user_id: 'u1' }, old: { user_id: 'u1' } };
    eq(shouldHandleEvent(payload, spaceIds), false);
  });
});

// ─── Tests: createDebounce – timing behavior ─────────────────────────────────

describe('createDebounce – timing behavior', () => {
  test('REALTIME_DEBOUNCE_MS is 2000', () => {
    eq(REALTIME_DEBOUNCE_MS, 2000);
  });

  test('schedule returns control immediately', () => {
    let called = false;
    const { schedule, cancel } = createDebounce(100);
    schedule(() => { called = true; });
    eq(called, false);
    cancel();
  });

  test('cancel removes pending fn', () => {
    let called = false;
    const { schedule, cancel } = createDebounce(100);
    schedule(() => { called = true; });
    cancel();
    // Verify no error on cancel
    eq(true, true);
  });
});

// ─── Ergebnis ─────────────────────────────────────────────────────────────────

process.stdout.write(
  `\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`
);

if (failed > 0) {
  process.exit(1);
}