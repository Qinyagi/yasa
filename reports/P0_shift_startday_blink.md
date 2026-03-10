# P0 – Shift Start-Day Blink & Pattern-Mapping

**Status:** Fixed
**Scope:** `app/(shift)/setup.tsx`, `lib/shiftEngine.ts`, `app/(shift)/calendar.tsx`, `app/(team)/today.tsx`

---

## Was wurde geändert

| Datei | Änderung |
|---|---|
| `lib/shiftEngine.ts` | **Neu.** Zentrale Funktionen: `diffDaysUTC`, `shiftCodeAtDate`, `weekdayIndexUTC`, `detectSubPattern` |
| `app/(shift)/setup.tsx` | Offset-Grid + korrekte Blink-Logik + Sub-Pattern-Hinweis-Banner |
| `app/(shift)/calendar.tsx` | Import shiftEngine; DEV-Debug-Logging beim Tag-Tap |
| `app/(team)/today.tsx` | Import shiftEngine; DEV-Debug-Logging beim Screen-Load |

---

## Domain-Invariante (unveränderlich)

```
Pattern[0]       ≡ Schichtcode des Startdatums
patternIndex(d)  = floor((UTC(d) − UTC(startDate)) / 86400000) % cycleLength
```

---

## Blink-Logik (Vorher → Nachher)

**Vorher (Bug):**
- Blink war immer fix auf `cellIdx === 0` (Montags-Spalte, Zeile 1)
- `pulseRunning.current` (ein Ref) steuerte die Sichtbarkeit im Render-Pfad
  → Ref-Updates triggern keinen Re-Render → Blink blieb sichtbar
- Kein Neustart wenn `handleAllOff` pattern[0] auf `'R'` zurücksetzte

**Nachher (Fix):**
- Grid ist **Offset-aware**: `Pattern[0]` erscheint in der Wochentags-Spalte von `startDate`
  (`validOffset = weekdayIndexUTC(startDate)`, 0 = Mo … 6 = So)
- Blink-Ziel: `patIdx === 0` (immer Pattern[0]), liegt jetzt in der richtigen Spalte
- Stop-Bedingung: `showBlinkEffect = pattern[0] === 'R'`
  → reines State-Derivat, korrekt reaktiv
- Neustart automatisch durch `useEffect([showBlinkEffect])` wenn `handleAllOff` zurücksetzt
- `weekdayIndexUTC` nutzt `Date.UTC() + getUTCDay()` → DST-stabil

---

## Repro Steps (Bug)

1. App öffnen → Setup → Startdatum auf einen **Mittwoch** setzen (z. B. `2025-01-01`)
2. Zykluslänge 7 wählen
3. **Erwartet:** Blink auf **Mi**-Spalte (Column 2), Zeile 1
4. **Alt/Bug:** Blink auf **Mo**-Spalte (Column 0), Zeile 1 → falsches visuelles Feedback

---

## Feature: Sub-Pattern-Erkennung (UX-Safeguard)

### Motivation

Nutzer geben ihren Schichtzyklus manuell ein. Dabei entsteht leicht ein typischer Fehler:
der Zyklus wird zwar korrekt begonnen, aber zu früh beendet. Beispiel:

```
Startdatum:  2026-02-25 (Mittwoch)
Eingegeben:  NNKRRRNNNNNNNRRRNNNNNNNKRRRNNNNNNNR  (35 Tage)
Tatsächlich: Periode 21 Tage → vollständiger Zyklus = 42 Tage
Fehlend:     RRNNNNN  (7 Tage = die letzte „C-Woche")
```

Ab Tag 36 wrappen die Schichtcodes auf Pattern[0] zurück, was zu falschen
Anzeigen im Kalender führt.

### Algorithmus (`lib/shiftEngine.ts → detectSubPattern`)

```
Für p = 7, 8, ..., n-1:
  Falls n % p = 0: überspringen (vollständige Wiederholung, kein Handlungsbedarf)
  Falls ∀ i ∈ [0,n): pattern[i] === pattern[i % p]:
    → completedLength = ⌈n/p⌉ * p
    → extension = [pattern[n%p], pattern[(n+1)%p], ..., pattern[(completedLength-1)%p]]
    → return { period: p, completedLength, extension }
Kein Treffer → null
```

Früh-Ausstieg:
- `n < 8`: zu wenig Eingabe für sinnvolle Erkennung
- `pattern.every(c => 'R')`: Nutzer hat noch nichts eingetragen
- `completedLength > 56`: außerhalb des App-Maximums

### UX-Verhalten (setup.tsx)

1. Banner erscheint automatisch unterhalb des Grids, sobald ein Muster erkannt wird
2. **„Auf N Tage vervollständigen"**: setzt cycleLength auf completedLength,
   hängt `extension` an das Pattern an → Pattern ist direkt korrekt
3. **„Ignorieren"**: merkt sich die aktuelle cycleLength, Banner verschwindet
   für genau diese Länge; erscheint wieder wenn cycleLength geändert wird
4. Keine Warnung bei vollständigen Zyklen (n % p = 0) und bei leerem Pattern

### Verifikation des Beispielfalls

```
pattern  = NNKRRRNNNNNNNRRRNNNNNNNKRRRNNNNNNNR (n=35)
p=7   → pattern[9]='N' ≠ pattern[9%7=2]='K' → kein Treffer
p=21  → Alle 35 Zellen stimmen mit pattern[i%21] überein ✓
         n%21 = 14 ≠ 0 → unvollständig ✓
         completedLength = ⌈35/21⌉*21 = 42
         extension (i=35..41) = pattern[14,15,16,17,18,19,20]
                               = R  R  N  N  N  N  N  ✓
```

---

## Regression-Checkliste

### Setup-Screen (`app/(shift)/setup.tsx`)

| Szenario | Expected | Tested |
|---|---|---|
| Startdatum = Montag | Blink auf Mo-Spalte, Zeile 1 | ☐ |
| Startdatum = Mittwoch | Blink auf Mi-Spalte, Zeile 1; Mo+Di leer | ☐ |
| Startdatum = Sonntag | Blink auf So-Spalte, Zeile 1; Mo–Sa leer | ☐ |
| Zelle antippen (Pattern[0] belegen) | Blink stoppt sofort | ☐ |
| „Alles Ruhe" nach Belegung | Blink startet neu | ☐ |
| Startdatum ändern (z. B. Mo→Do) | Blink-Spalte wechselt korrekt | ☐ |
| Zykluslänge ändern | Blink bleibt auf Pattern[0]-Zelle | ☐ |
| Zykluslänge 1 | Grid: 1 Zelle in der richtigen Spalte | ☐ |
| Zykluslänge 56, Startdatum = So | Grid: 8+ Zeilen, So-Spalte oben blinkt | ☐ |
| Vorschau nach Speichern | Korrekte Shift-Codes in der Vorschau | ☐ |

### Sub-Pattern-Erkennung (`setup.tsx → detectSubPattern`)

| Szenario | Expected | Tested |
|---|---|---|
| 35-Tage-Muster mit Periode 21 (Beispielfall oben) | Banner erscheint: „Alle 21 Tage … auf 42 Tage vervollständigen?" | ☐ |
| „Vervollständigen" tippen | cycleLength → 42, Pattern[35..41] = RRNNNNN, Banner weg | ☐ |
| „Ignorieren" tippen | Banner verschwindet, kein Neuerscheinen bei gleicher Länge | ☐ |
| cycleLength nach Ignorieren ändern | Banner kann für neue Länge wieder erscheinen | ☐ |
| Alle Zellen = R (Frisch-Pattern) | Kein Banner | ☐ |
| Vollständige Wiederholung (n % p = 0, z. B. 14 Tage, Periode 7) | Kein Banner | ☐ |
| cycleLength < 8 | Kein Banner | ☐ |
| completedLength würde > 56 | Kein Banner | ☐ |
| Muster ohne Periode (z. B. komplett individuelles 28-Tage-Muster) | Kein Banner | ☐ |

### Calendar-Screen (`app/(shift)/calendar.tsx`)

| Szenario | Expected | Tested |
|---|---|---|
| Startdatum = Mi, Tag antippen | DEV-Log: `diffDays` und `patternIndex` korrekt | ☐ |
| Startdatum-Tag selbst antippen (diff=0) | `patternIndex = 0`, `shift = pattern[0]` | ☐ |
| Tag vor Startdatum antippen | DEV-Log: `diff < 0`, `patternIndex = -1` | ☐ |
| Shift-Farben im Kalender | Stimmen mit gespeichertem Pattern überein | ☐ |
| Urlaubsmodus umschalten | Funktioniert unverändert | ☐ |

### Today-Screen (`app/(team)/today.tsx`)

| Szenario | Expected | Tested |
|---|---|---|
| Today laden | DEV-Log zeigt `diffDays`, `patternIndex`, `shift` korrekt | ☐ |
| `shift` in Log == angezeigter Schicht-Badge | Konsistent | ☐ |
| Pattern[0] == Startdatum-Shift | Bestätigung durch DEV-Log (diff=0 → idx=0) | ☐ |

---

## Edge Cases

### Startdatum an DST-Grenzen

| Datum | Timezone | Erwartet | Risiko ohne Fix |
|---|---|---|---|
| 2025-03-30 (DE-Sommerzeitbeginn) | Europe/Berlin | Korrekte Diff | `new Date(iso).getDay()` → Vortagsfehler |
| 2025-10-26 (DE-Winterzeitbeginn) | Europe/Berlin | Korrekte Diff | Wie oben |
| 2025-01-01 | UTC-5 | Wochentag = Mittwoch | `getDay()` gibt Dienstag (31.12.) |

**Fix:** `weekdayIndexUTC` und `diffDaysUTC` verwenden ausschließlich `Date.UTC()` / `getUTCDay()`.

### Zykluslänge-Varianten

| cycleLength | startWeekday | Expected Grid |
|---|---|---|
| 7 | Mo (0) | 1 Zeile, keine Leer-Spalten |
| 7 | So (6) | 2 Zeilen: [leer×6, P0] / [P1-P6, leer] |
| 10 | Mi (2) | 2 Zeilen: [leer×2, P0-P4] / [P5-P9, leer×4] |
| 14 | Mo (0) | 2 Zeilen, keine Leer-Spalten |
| 28 | Mo (0) | 4 Zeilen, keine Leer-Spalten |
| 28 | Fr (4) | 5 Zeilen |
| 1 | So (6) | 1 Zeile: [leer×6, P0] |
| 56 | So (6) | 9 Zeilen |

### Pattern-Mapping Verifikation

Manueller Check-Algorithmus:
```
startDate = "2025-01-01" (Mittwoch, weekday=2)
cycleLength = 10
pattern = [F, S, N, T, K, R, U, X, F, S]

Datum        diff  idx  Shift
2025-01-01   0     0    F   ← Pattern[0] = startDate ✓
2025-01-02   1     1    S
2025-01-10   9     9    S
2025-01-11   10    0    F   ← Wrap-around ✓
2025-01-20   19    9    S
2025-12-31  364    4    K
```

---

## TypeScript-Check

```sh
cd yasa && npx tsc --noEmit
# Expected: no errors
```
