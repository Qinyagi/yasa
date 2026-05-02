/**
 * Rule Profile Sync – Unit tests for rule profile merge invariants
 *
 * Ausführen: cd yasa && npx sucrase-node lib/__tests__/ruleSyncMerge.test.ts
 *
 * Abgedeckte Invarianten:
 *   R1: Member receives rule profile from remote pull
 *   R2: Backend offline – local rule profile preserved (not downgraded)
 *   R2b: Remote returns null – local preserved (no null-downgrade)
 *   R3: Multiple spaces with same name – correct ID-based merge
 *   R4: Remote update overwrites older local version
 */

import type { SpaceRuleProfile } from '../../types/timeAccount';

// ─── Minimales Test-Framework ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function describe(suiteName: string, fn: () => void): void {
  process.stdout.write(`\n  ${suiteName}\n`);
  fn();
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    process.stdout.write(`    ✓ ${name}\n`);
    passed++;
  } catch (e) {
    process.stdout.write(`    ✗ ${name}\n`);
    process.stdout.write(`      → ${e instanceof Error ? e.message : String(e)}\n`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function ok(value: unknown, msg?: string): void {
  if (!value) throw new Error(msg ?? `Expected truthy, got ${JSON.stringify(value)}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockSpace {
  id: string;
  name: string;
  spaceRuleProfile: SpaceRuleProfile | null;
}

// ─── Pure extract of the rule profile merge from syncTeamSpaces ──────────────

function mergeRuleProfile(
  localSpace: MockSpace | undefined,
  remoteSpace: MockSpace
): SpaceRuleProfile | null {
  return remoteSpace.spaceRuleProfile ?? localSpace?.spaceRuleProfile ?? null;
}

function mergeSpaces(
  localSpaces: MockSpace[],
  remoteSpaces: MockSpace[]
): MockSpace[] {
  const byId = new Map<string, MockSpace>();
  for (const space of localSpaces) byId.set(space.id, space);
  for (const remoteSpace of remoteSpaces) {
    const localSpace = byId.get(remoteSpace.id);
    byId.set(remoteSpace.id, {
      ...remoteSpace,
      spaceRuleProfile: mergeRuleProfile(localSpace, remoteSpace),
    });
  }
  return Array.from(byId.values());
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RULE_PROFILE: SpaceRuleProfile = {
  spaceId: 'space-1',
  bundesland: 'NW',
  branche: 'Gesundheit / Pflege',
  ruleProfileName: 'TVöD Krankenhaus NW',
  sourceLabel: 'TVöD § 6 Abs. 3',
  codeRules: { W: { enabled: true }, T: { enabled: false } },
  holidayCredit: { enabled: true, hoursPerHolidayShift: 7.7 },
  preHolidayCredit: { enabled: true, hoursPerOccurrence: 3.85 },
  schoolHolidaysEnabledByDefault: true,
  updatedAt: '2026-04-10T12:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Rule Profile Sync Merge', () => {
  test('R1: Member receives rule profile from remote pull', () => {
    const localSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: null },
    ];
    const remoteSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: RULE_PROFILE },
    ];

    const merged = mergeSpaces(localSpaces, remoteSpaces);
    const space = merged.find((s) => s.id === 'space-1');

    ok(space, 'space-1 must exist in merged result');
    ok(space!.spaceRuleProfile, 'rule profile must not be null');
    eq(space!.spaceRuleProfile!.ruleProfileName, 'TVöD Krankenhaus NW');
    eq(space!.spaceRuleProfile!.spaceId, 'space-1');
  });

  test('R2: Backend offline – local rule profile preserved (remote absent)', () => {
    const localSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: RULE_PROFILE },
    ];
    const remoteSpaces: MockSpace[] = []; // offline = no pull result

    const merged = mergeSpaces(localSpaces, remoteSpaces);
    const space = merged.find((s) => s.id === 'space-1');

    ok(space, 'space-1 must be preserved from local');
    ok(space!.spaceRuleProfile, 'local rule profile must survive');
    eq(space!.spaceRuleProfile!.ruleProfileName, 'TVöD Krankenhaus NW');
  });

  test('R2b: Remote returns null rule profile – local preserved', () => {
    const localSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: RULE_PROFILE },
    ];
    const remoteSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: null },
    ];

    const merged = mergeSpaces(localSpaces, remoteSpaces);
    const space = merged.find((s) => s.id === 'space-1');

    ok(space, 'space-1 must exist');
    ok(space!.spaceRuleProfile, 'local rule profile must not be downgraded to null');
    eq(space!.spaceRuleProfile!.ruleProfileName, 'TVöD Krankenhaus NW');
  });

  test('R3: Multiple spaces with same name – correct ID-based merge', () => {
    const ruleForSpace2: SpaceRuleProfile = {
      ...RULE_PROFILE,
      spaceId: 'space-2',
      ruleProfileName: 'TVöD Pflege BW',
    };

    const localSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: null },
      { id: 'space-2', name: 'AOCC', spaceRuleProfile: null },
    ];
    const remoteSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: RULE_PROFILE },
      { id: 'space-2', name: 'AOCC', spaceRuleProfile: ruleForSpace2 },
    ];

    const merged = mergeSpaces(localSpaces, remoteSpaces);

    const s1 = merged.find((s) => s.id === 'space-1');
    const s2 = merged.find((s) => s.id === 'space-2');

    eq(s1!.spaceRuleProfile!.ruleProfileName, 'TVöD Krankenhaus NW');
    eq(s1!.spaceRuleProfile!.spaceId, 'space-1');
    eq(s2!.spaceRuleProfile!.ruleProfileName, 'TVöD Pflege BW');
    eq(s2!.spaceRuleProfile!.spaceId, 'space-2');
  });

  test('R4: Remote rule profile update overwrites older local version', () => {
    const updatedRemote: SpaceRuleProfile = {
      ...RULE_PROFILE,
      ruleProfileName: 'TVöD Krankenhaus NW v2',
      updatedAt: '2026-04-15T08:00:00Z',
    };

    const localSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: RULE_PROFILE },
    ];
    const remoteSpaces: MockSpace[] = [
      { id: 'space-1', name: 'AOCC', spaceRuleProfile: updatedRemote },
    ];

    const merged = mergeSpaces(localSpaces, remoteSpaces);
    const space = merged.find((s) => s.id === 'space-1');

    eq(space!.spaceRuleProfile!.ruleProfileName, 'TVöD Krankenhaus NW v2');
    eq(space!.spaceRuleProfile!.updatedAt, '2026-04-15T08:00:00Z');
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────────

process.stdout.write(`\n  Result: ${passed} passed, ${failed} failed\n\n`);
if (failed > 0) process.exit(1);
