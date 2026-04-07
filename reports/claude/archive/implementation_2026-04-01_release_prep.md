# YASA Release Prep — iOS Config Hardening
**Date:** 2026-04-01
**Engineer:** Senior Release Engineer
**Scope:** iOS app.json release-readiness (L-004, L-005, L-006)
**Build:** tsc exit 0 · Tests 57/57

---

## Files Changed

| File | Change |
|------|--------|
| `app.json` | Added bundleIdentifier, NSCameraUsageDescription, NSFaceIDUsageDescription |

---

## app.json Changes

### Added / Updated Fields

| Field | Value |
|-------|-------|
| `expo.ios.bundleIdentifier` | `com.bonitox.yasa` |
| `expo.ios.infoPlist.NSCameraUsageDescription` | `"YASA verwendet die Kamera zum Scannen von QR-Codes für den Workspace-Beitritt."` |
| `expo.ios.infoPlist.NSFaceIDUsageDescription` | `"YASA verwendet Face ID zum Schutz des Admin-Bereichs."` |

### Before / After (ios block only)

**Before:**
```json
"ios": {
  "supportsTablet": true
},
```

**After:**
```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.bonitox.yasa",
  "infoPlist": {
    "NSCameraUsageDescription": "YASA verwendet die Kamera zum Scannen von QR-Codes für den Workspace-Beitritt.",
    "NSFaceIDUsageDescription": "YASA verwendet Face ID zum Schutz des Admin-Bereichs."
  }
},
```

---

## Verification

### TypeScript
```
> yasa@1.0.0 typecheck
> tsc --noEmit

Exit 0 — no errors
```

### npm test
```
> yasa@1.0.0 test
> sucrase-node lib/__tests__/shiftEngine.test.ts && sucrase-node lib/__tests__/timeclock.test.ts && sucrase-node lib/__tests__/strategyEngine.test.ts && sucrase-node lib/__tests__/timeAccountEngine.test.ts

shiftEngine:       37 passed, 0 failed
timeclock:         15 passed, 0 failed
strategyEngine:     4 passed, 0 failed
timeAccountEngine:  1 passed, 0 failed

Total: 57 passed, 0 failed
Exit code: 0
```

---

## Remaining Manual Steps

1. **EAS Build / Xcode:** The `bundleIdentifier` and `infoPlist` entries are applied at build time via `expo prebuild` or EAS Build. A new EAS build (or local `npx expo run:ios`) must be triggered to generate the updated `ios/` native project with these values compiled in.
2. **App Store Connect:** Ensure the Bundle ID `com.bonitox.yasa` is registered in App Store Connect and matches the provisioning profile used for distribution.
3. **NSCameraUsageDescription review:** Confirm the German description is acceptable for App Store review. Apple requires descriptions to clearly state the purpose — the provided string satisfies this requirement.
4. **NSFaceIDUsageDescription review:** Same as above. The provided string satisfies Apple's requirement for Face ID usage descriptions.

---

*Date/time: 2026-04-01*
*Scope completed: iOS bundleIdentifier + NSCameraUsageDescription + NSFaceIDUsageDescription*
*Open items: EAS Build / Xcode rebuild required to materialize native changes*
**READY_FOR_READ_LATEST: YES**
