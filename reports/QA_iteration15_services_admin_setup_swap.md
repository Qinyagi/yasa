# QA Report - Iteration 15: Services Hub, Admin Safetylock, Setup Calendar, Swap Fix

**Datum:** 2026-02-19
**Feature:** UI/UX Iteration – Services, Admin, Setup, Swap
**Status:** ✅ VOLLSTÄNDIG IMPLEMENTIERT

---

## Zusammenfassung

| Punkt | Beschreibung | Status |
|-------|-------------|--------|
| A | Startscreen Refactor | ✅ |
| B | Services Hub Page | ✅ |
| C | Admin Safetylock + Datenbereinigung | ✅ |
| D | Setup Calendar Modal + Pulse Animation | ✅ |
| E | Swap Guard Screens + Date-Refresh Fix | ✅ |
| F | Root Layout Registration | ✅ |
| G | TypeScript Check | ✅ Exit 0 |

---

## A) Startscreen Refactor (`app/index.tsx`)

### Geändert
- ❌ „Profil löschen" Button entfernt (jetzt nur im Admin-Bereich)
- ✅ „YASA Services" Button → navigiert zu `/(services)`
- ✅ „📅 Mein Kalender" Button (grün) → navigiert zu `/(shift)/calendar`
- ✅ „🏠 Dein Space" Button (blau, nur wenn `hasSpaces`) → navigiert zu `/(space)/choose`
- ✅ „🔐 Admin Bereich" Button beibehalten
- ✅ Hinweis-Texte wenn Space oder Schichtplan fehlt
- ✅ Container auf ScrollView umgestellt

---

## B) Services Hub Page (`app/(services)/index.tsx`)

### Neu erstellt
- Layout-Datei: `app/(services)/_layout.tsx`
- Hub-Screen: `app/(services)/index.tsx`

### Services (6 Karten)
| Service | Route | Space benötigt |
|---------|-------|---------------|
| Meine Shiftpals | `/(team)/today` | ✅ |
| Mein Schichtmuster | `/(shift)/setup` | ❌ |
| Mein Kalender | `/(shift)/calendar` | ❌ |
| Urlaub & Strategie | `/(shift)/strategy` | ❌ |
| Schichttausch | `/(swap)` | ✅ |
| Swap-Kandidaten | `/(swap)/candidates` | ✅ |

### Guards
- Kein Profil → „Profil benötigt" Screen mit CTA
- Kein Space → Warning-Banner + Space-abhängige Services zeigen „Space erstellen"

---

## C) Admin Safetylock (`app/(admin)/index.tsx`)

### Profil löschen
- 2-Schritt Modal:
  - Step 0: Auflistung was gelöscht wird + „Weiter" Button
  - Step 1: „Bist du sicher?" + „Ich bin sicher – löschen" Button (dunkelrot)
- Vollständige Datenbereinigung via `AsyncStorage.multiRemove`:
  - `yasa.shifts.v1`
  - `yasa.ghosts.v1`
  - `yasa.vacation.v1`
  - `yasa.swaps.v1`
  - Plus: `clearProfile()`, `setSpaces([])`, `clearCurrentSpaceId()`

### Space löschen
- 2-Tap Bestätigung beibehalten (1. Tap = Bestätigung anzeigen, 2. Tap = Löschen)
- Biometric Auth Gate für Admin-Bereich erhalten

---

## D) Setup Calendar Modal (`app/(shift)/setup.tsx`)

### Bug behoben
- `showCalendar` state war vorhanden, aber kein Modal renderte → **FIXED**

### Neue Features
- **Kalender-Modal**: Vollständiger Monatskalender mit:
  - Monatsnavigation (Pfeil-Buttons links/rechts)
  - Wochentag-Header (Mo–So)
  - Tag-Zellen mit Farbkodierung:
    - Ausgewählter Tag: blauer Hintergrund
    - Heute: blauer Rahmen
    - Tage außerhalb des Monats: gedimmt
  - „Heute wählen" Button
  - „Schließen" Button
  - Overlay (dimmed background, tap-to-dismiss)
  - Kalendermonat initialisiert sich vom aktuellen `startDate`

- **Pulse-Animation**:
  - Erste Grid-Zelle (Index 0) pulsiert (Opazität 1 → 0.35 → 1) mit blauem Rahmen
  - Stoppt automatisch sobald `pattern[0]` von 'R' auf einen anderen Wert geändert wird
  - Nutzt `Animated.loop` mit `useNativeDriver: true`

---

## E) Swap Fix (`app/(swap)/index.tsx`)

### Bugs behoben
1. **Fehlende Guard-Screens**: Kein Feedback wenn Profil oder Space fehlt → Screen zeigte leere Daten
   - ✅ Guard für `!profile` → „Profil benötigt" Screen + CTA
   - ✅ Guard für `!spaceId` → „Space benötigt" Screen + CTA

2. **Datum-Wechsel aktualisiert Shift/Kandidaten nicht**: `setSelectedDate` änderte nur State, triggerte aber keinen Reload
   - ✅ Neue `handleDateChange()` Funktion die Shift + Kandidaten sofort nachlädt

---

## TypeScript Check

```
npx tsc --noEmit → Exit 0 (kein Fehler)
```

---

## Geänderte Dateien

| Datei | Aktion |
|-------|--------|
| `app/index.tsx` | REWRITTEN |
| `app/_layout.tsx` | MODIFIED (+ (services)) |
| `app/(services)/_layout.tsx` | NEW |
| `app/(services)/index.tsx` | NEW |
| `app/(admin)/index.tsx` | REWRITTEN |
| `app/(shift)/setup.tsx` | MODIFIED (+Calendar Modal, +Pulse) |
| `app/(swap)/index.tsx` | MODIFIED (+Guards, +handleDateChange) |

---

## Regression

- Keine Regression bekannt
- Alle bestehenden Screens bleiben funktionsfähig
- Route-Gruppen vollständig registriert in `_layout.tsx`
