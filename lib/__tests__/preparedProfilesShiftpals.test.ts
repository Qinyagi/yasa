import assert from 'assert';
import { buildPreparedShiftpalEntries, buildPreparedSwapCandidates } from '../preparedProfilesShiftpals';
import type { PreparedIdProfile } from '../../types/preparedProfile';

function preparedProfile(overrides: Partial<PreparedIdProfile> = {}): PreparedIdProfile {
  return {
    id: 'prepared-1',
    spaceId: 'space-1',
    profileId: 'future-member-1',
    displayName: 'Future Shiftpal',
    avatarUrl: 'future:shiftpal',
    status: 'ready-to-transfer',
    assignedPattern: {
      templateId: 'template-1',
      templateName: 'Nachtblock',
      pattern: ['N', 'R', 'F'],
      cycleLengthDays: 3,
      anchorDateISO: '2026-05-01',
    },
    createdByProfileId: 'host-1',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log('\n  prepared profiles in Shiftpals');

test('shows prepared profile when derived shift matches viewed user shift', () => {
  const entries = buildPreparedShiftpalEntries(
    [preparedProfile()],
    '2026-05-01',
    'N'
  );

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].member.id, 'future-member-1');
  assert.strictEqual(entries[0].member.displayName, 'Future Shiftpal');
  assert.strictEqual(entries[0].code, 'N');
  assert.strictEqual(entries[0].preparedProfileId, 'prepared-1');
});

test('hides prepared shiftpal when derived shift does not match', () => {
  const entries = buildPreparedShiftpalEntries(
    [preparedProfile()],
    '2026-05-02',
    'N'
  );

  assert.strictEqual(entries.length, 0);
});

test('hides shiftpal profiles without assigned pattern', () => {
  const entries = buildPreparedShiftpalEntries(
    [preparedProfile({ assignedPattern: undefined })],
    '2026-05-01',
    'N'
  );

  assert.strictEqual(entries.length, 0);
});

test('hides transferred shiftpal profiles to avoid active-member duplication', () => {
  const entries = buildPreparedShiftpalEntries(
    [preparedProfile({ status: 'transferred' })],
    '2026-05-01',
    'N'
  );

  assert.strictEqual(entries.length, 0);
});

test('hides prepared shiftpal when same profile id is already an active member', () => {
  const entries = buildPreparedShiftpalEntries(
    [preparedProfile()],
    '2026-05-01',
    'N',
    ['future-member-1']
  );

  assert.strictEqual(entries.length, 0);
});

test('shows prepared swap candidate when derived shift is free', () => {
  const entries = buildPreparedSwapCandidates(
    [preparedProfile()],
    '2026-05-02'
  );

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].member.id, 'future-member-1');
  assert.strictEqual(entries[0].code, 'R');
  assert.strictEqual(entries[0].preparedProfileId, 'prepared-1');
});

test('hides prepared swap candidate when derived shift is not free', () => {
  const entries = buildPreparedSwapCandidates(
    [preparedProfile()],
    '2026-05-01'
  );

  assert.strictEqual(entries.length, 0);
});

test('hides transferred prepared swap candidates', () => {
  const entries = buildPreparedSwapCandidates(
    [preparedProfile({ status: 'transferred' })],
    '2026-05-02'
  );

  assert.strictEqual(entries.length, 0);
});

test('hides prepared swap candidate when same profile id is already an active member', () => {
  const entries = buildPreparedSwapCandidates(
    [preparedProfile()],
    '2026-05-02',
    ['future-member-1']
  );

  assert.strictEqual(entries.length, 0);
});

console.log('\n  Ergebnis: 9 bestanden, 0 fehlgeschlagen');
