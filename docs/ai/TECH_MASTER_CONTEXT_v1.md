# YASA – Tech Master Context v1

## Stack
- Expo SDK 54 (`expo ~54.0.33`)
- expo-router `~6.0.23` (file-based routing)
- React 19.1.0 / React Native 0.81.5
- TypeScript 5.9.2 (strict, `tsc --noEmit` clean)
- AsyncStorage 2.2.0 (offline-only, kein Backend)

## Route Groups (8)
| Group | Prefix | Screens |
|-------|--------|---------|
| root | `/` | `index.tsx` (Startscreen) |
| (auth) | `/(auth)` | `create-profile.tsx` |
| (space) | `/(space)` | `choose`, `create`, `join`, `manage`, `qr` |
| (shift) | `/(shift)` | `setup`, `calendar`, `strategy` |
| (team) | `/(team)` | `today` |
| (swap) | `/(swap)` | `index`, `candidates` |
| (admin) | `/(admin)` | `index` |
| (services) | `/(services)` | `index` |

Alle Layouts: `<Stack screenOptions={{ headerShown: false }} />`

## Storage Keys (7)
| Key | Wert | Typ |
|-----|------|-----|
| PROFILE | `yasa.profile.v1` | `UserProfile \| null` |
| SPACES | `yasa.spaces.v1` | `Space[]` |
| CURRENT_SPACE_ID | `yasa.currentSpaceId.v1` | `string \| null` |
| SHIFTS | `yasa.shifts.v1` | `Record<string, UserShiftPlan>` |
| GHOSTS | `yasa.ghosts.v1` | `UserProfile[]` (kind='ghost') |
| VACATION | `yasa.vacation.v1` | `Record<string, string[]>` |
| SWAPS | `yasa.swaps.v1` | `SwapRequest[]` |

## Shift Types (8)
`F` Frueh | `S` Spaet | `N` Nacht | `T` Tagesdienst | `K` Kurzer Dienst | `R` Ruhe | `U` Urlaub | `X` Frei

## Core Types (types/index.ts)
- `UserProfile` (id, displayName, avatarUrl, createdAt, kind?, ghost-fields?)
- `Space` (id, name, ownerProfileId, inviteToken, coAdminProfileIds[], memberProfileIds[], memberProfiles[])
- `UserShiftPlan` (profileId, startDateISO, pattern, cycleLengthDays, entries[])
- `ShiftEntry` (dateISO, code)
- `ShiftType` = `'F'|'S'|'N'|'T'|'K'|'R'|'U'|'X'`
- `SwapRequest` (id, spaceId, requesterProfileId, date, shiftCode, status, message?, acceptedByProfileId?)
- `VacationStrategy` (urlaubstage[], freieTage, feiertag)
- `MemberSnapshot` (id, displayName, avatarUrl)

## Security
- **Biometric Auth**: Admin-Bereich (expo-local-authentication)
- **3-Step Safetylock**: Profil-Loeschung (3 Bestaetigungen)
- **Role Guards**: Owner (manage, delete), CoAdmin (QR), Member (implicit)
- **QR**: Nur anzeigen, kein Teilen/Export/Kopieren

## Dependencies
| Feature | Package |
|---------|---------|
| Camera/QR Scan | expo-camera |
| QR Generation | react-native-qrcode-svg |
| Biometrics | expo-local-authentication |
| Avatars | @multiavatar/multiavatar |
| Storage | @react-native-async-storage/async-storage |
| Deep Linking | expo-linking (scheme: yasa) |
| SVG | react-native-svg |

## Constraints
- Offline-only, kein Backend
- Kein Teilen/Copy/Export von QR
- Keine PII
- Guards: Profil -> Space -> Feature
