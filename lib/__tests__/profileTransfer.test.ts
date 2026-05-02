import {
  buildProfileTransferPayload,
  parseProfileTransferPayload,
  type ProfileTransferPayload,
} from '../profileTransfer';

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

console.log('\n  profileTransfer');

const payload: ProfileTransferPayload = {
  version: '1',
  profileId: 'profile-123',
  displayName: 'Mambo Jam',
  avatarUrl: 'mambo jam',
  createdAt: '2026-04-28T12:00:00.000Z',
  createdByProfileId: 'host-1',
  spaceId: 'space-1',
  spaceName: 'AOCC VZ TEAM SPACE',
  ownerProfileId: 'host-1',
  ownerDisplayName: 'Host Name',
  ownerAvatarUrl: 'host seed',
  inviteToken: 'ABC123',
  assignedPattern: {
    templateId: 'template-1',
    templateName: 'AOCC Standard',
    pattern: ['F', 'S', 'N', 'R'],
    cycleLengthDays: 4,
    anchorDateISO: '2026-04-28',
    patternTodayIndex: 2,
  },
};

const encoded = buildProfileTransferPayload(payload);
const parsed = parseProfileTransferPayload(encoded);

assert('builds profile-transfer URL', encoded.startsWith('yasa://profile-transfer?'));
assert('roundtrips profile id', parsed?.profileId === payload.profileId);
assert('roundtrips display name with spaces', parsed?.displayName === payload.displayName);
assert('roundtrips avatar seed with spaces', parsed?.avatarUrl === payload.avatarUrl);
assert('roundtrips space name with spaces', parsed?.spaceName === payload.spaceName);
assert('roundtrips owner avatar', parsed?.ownerAvatarUrl === payload.ownerAvatarUrl);
assert('roundtrips assigned pattern name', parsed?.assignedPattern?.templateName === 'AOCC Standard');
assert('roundtrips assigned pattern codes', parsed?.assignedPattern?.pattern.join('|') === 'F|S|N|R');
assert('roundtrips assigned pattern anchor', parsed?.assignedPattern?.anchorDateISO === '2026-04-28');
assert('roundtrips assigned pattern today index', parsed?.assignedPattern?.patternTodayIndex === 2);
assert('rejects regular invite QR', parseProfileTransferPayload('yasa://join?spaceId=x&token=y') === null);
assert('rejects missing token', parseProfileTransferPayload(encoded.replace('token=ABC123', '')) === null);
assert('rejects wrong version', parseProfileTransferPayload(encoded.replace('v=1', 'v=2')) === null);

console.log(`\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) {
  console.error('FEHLGESCHLAGEN:', results);
  process.exit(1);
}
