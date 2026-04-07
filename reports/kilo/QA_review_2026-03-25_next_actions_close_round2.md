# QA-Gate-Review: Next Actions Close Round 2
**Datum:** 2026-03-25
**Reviewer:** YASA QA-Gate (automated senior review)
**Scope:** getShiftForDate Override · AppState · Konsistenz-Docs · Warnhinweis · Tests
**Referenz-Reports:** QA_review_2026-03-25_timeclock_overnight_gate.md · QA_review_2026-03-25_next_actions_close.md
**Build:** yasa v1.0.0 · tsc Exit 0 · Tests 37/37

---

## 1) Findings

### [LOW – verbleibend] sortedEvents → displayEvents: shiftCases nun auf vollem Array, aber Benennung kann täuschen
- **Datei + Zeile:** `app/(services)/timeclock.tsx:368-370`
- **Risiko/Impact:** Die Variable wurde von `sortedEvents` in `displayEvents` umbenannt, und `shiftCases` + `daySummaries` arbeiten jetzt korrekt auf dem vollen `events`-Array (Zeilen 369-370). Das Display-Limit trifft nur noch die "Letzte Stempelzeiten"-Liste (Zeile 958-977). Das Kernproblem aus dem Vor-Report ist damit behoben. Verbleibender Restpunkt: Die "Letzte Stempelzeiten"-Liste zeigt weiterhin maximal 30 Events; bei Heavy-Usern (>30 Events) werden ältere Einträge ausgeblendet. Das ist jetzt vollständig auf die Anzeigeliste beschränkt und betrifft keine Zustandsberechnung mehr.
- **Bewertung:** PARTIAL FIXED — State-Pfade sind korrekt getrennt. Display-Limit der Anzeigeliste bleibt als Low-Backlog-Item bestehen.
- **Reproduktion:** Nur relevant für User mit > 30 Stempel-Events in der "Letzte Stempelzeiten"-Karte.
- **Empfehlung:** Kein blocking issue. Optional: Hinweistext "Ältere Einträge nicht angezeigt" wenn `events.length > 30`.

---

### [INFO – offen] Unit-Tests für Overnight-Stempelpfad fehlen weiterhin
- **Datei:** `yasa/lib/__tests__/` (nur shiftEngine.test.ts und timeAccountEngine.test.ts)
- **Risiko/Impact:** Keine neuen Testdateien für `deriveTimeClockStampState`, `selectedShiftDateISO`-Overnight-Pfad oder `detectStampPrompt`. Regressionssicherheit für den Overnight-Kern bleibt ausschließlich manuell. Da alle anderen Findings gefixt sind, ist dieses Item der einzige verbleibende Rückstand.
- **Bewertung:** NOT ADDED — unverändert gegenüber Round 1.
- **Empfehlung:** `lib/__tests__/timeclock.test.ts` anlegen. Priorität: mittel (Backlog). Blocking für diesen Gate-Lauf: nein.

---

## 2) Verifizierte Stärken

**1. F1 FIXED: getShiftForDate konsultiert jetzt getShiftOverrides (storage.ts:451-461).** Die Funktion prüft per `dateISO in overrides` und gibt `overrides[dateISO] ?? null` zurück, bevor sie auf `plan.entries` zurückgreift. Korrekte Fallback-Kette: Override → Plan → null. Overnight-Pfad und detectStampPrompt erhalten jetzt den tatsächlichen Schichtcode.

**2. F2 FIXED: Divergenz-Kommentar in beiden Dateien eingebaut.**
- `app/index.tsx:164-167`: Kommentar erklärt explizit, dass das Popup absichtlich fenstergebunden ist und der Service-Screen event-basiert weiterläuft.
- `app/(services)/timeclock.tsx:390-392`: Kommentar erklärt, dass `selectedShiftDateISO` bewusst event-basiert ist und ein offener gestiger Dienst auch nach Ablauf des Popup-Fensters weiter angezeigt wird.

**3. F3 FIXED: AppState-Listener in beiden Screens korrekt implementiert.**
- `app/index.tsx:236-243`: `AppState.addEventListener('change', ...)` mit `state === 'active'` → `loadCurrentContext()`. Cleanup via `subscription.remove()` im useEffect-Return.
- `app/(services)/timeclock.tsx:359-366`: Analoges Muster mit `loadData()`. Cleanup korrekt.
- Kein Race-Condition-Problem: `useFocusEffect` und `AppState`-Listener teilen dieselbe `loadCurrentContext()`/`loadData()`-Referenz via `useCallback`. Da `setLoading(true)` idempotent ist, ist ein doppelter Trigger unproblematisch.

**4. F4 FIXED: dismissedPromptKey dokumentiert (app/index.tsx:97-98).** Kommentar `// Bewusst in-memory: "Spaeter" gilt nur bis zum naechsten App-Restart.` vorhanden. Design-Entscheidung explizit kommuniziert.

**5. F5 FIXED: Schnellstempel Warn-Text implementiert (timeclock.tsx:666-670).** Conditional `{selectedShiftState.allowedEventType !== null && selectedEventType !== selectedShiftState.allowedEventType ? <Text ...> : null}` korrekt im JSX platziert — nach `helperText`, vor dem Test-Popup-Button. Style `inlineWarningText` (Zeile 1101-1110) mit Border, Hintergrundfarbe `#FFFBEB` und Padding ist visuell prominent genug.

**6. F6 PARTIAL FIXED: shiftCases/daySummaries auf vollem events-Array (timeclock.tsx:369-370).** `displayEvents`-Slice isoliert auf die Anzeigeliste. State-kritische Pfade (monthSummary, selectedShiftDateISO, selectedShiftEvents, shiftCases) operieren alle auf dem vollen `events`-Array. Overnight-Fix-Kern nicht betroffen.

**7. Overnight-Fix-Kern intakt (keine Regression).** `selectedShiftDateISO`-Memo (timeclock.tsx:383-394) und zweistufige Priorität in `detectStampPrompt` (index.tsx:163-191) sind korrekt und unverändert stabil.

---

## 3) Test-/Check-Protokoll

| Check | Command | Ergebnis | Notiz |
|-------|---------|----------|-------|
| TypeScript | `cd yasa && npx tsc --noEmit` | PASS – Exit 0 | Keine Fehler, keine Warnings |
| Unit Tests (shiftEngine + timeAccountEngine) | `cd yasa && npm test` | PASS – 37/37 | Unverändert; keine neuen Tests für Overnight-Pfad |
| AppState-Import index.tsx | Grep `AppState` in app/index.tsx | FOUND (Zeile 10) | `AppState` aus react-native importiert |
| AppState-Listener index.tsx | Zeile 236-243 index.tsx | FOUND | addEventListener + subscription.remove() |
| AppState-Import timeclock.tsx | Grep `AppState` in timeclock.tsx | FOUND (Zeile 4) | `AppState` aus react-native importiert |
| AppState-Listener timeclock.tsx | Zeile 359-366 timeclock.tsx | FOUND | addEventListener + subscription.remove() |
| getShiftForDate Override-Konsultation | storage.ts:455-456 | FIXED | `getShiftOverrides` + `in`-Guard + `?? null` |
| Divergenz-Kommentar index.tsx | Zeile 164-167 | FOUND | Erklärt Fenster-Gebundenheit und Service-Screen-Verhalten |
| Divergenz-Kommentar timeclock.tsx | Zeile 390-392 | FOUND | Erklärt event-basierte selectedShiftDateISO |
| dismissedPromptKey Kommentar | index.tsx:97-98 | FOUND | In-Memory-Design dokumentiert |
| Schnellstempel Warn-Text JSX | timeclock.tsx:666-670 | FOUND | Conditional inline warning mit Style |
| inlineWarningText Style | timeclock.tsx:1101-1110 | FOUND | Border + #FFFBEB Background + Padding |
| shiftCases auf vollem events-Array | timeclock.tsx:369 | FIXED | `buildShiftCases(events, config)` nicht Slice |
| displayEvents Slice nur Anzeigeliste | timeclock.tsx:958-977 | BESTÄTIGT | Nur in "Letzte Stempelzeiten"-Karte |
| deriveTimeClockStampState Tests | Glob lib/__tests__/*.test.ts | NOT ADDED | Keine neue Testdatei |
| app/__tests__/ Verzeichnis | Glob app/__tests__/ | NOT EXISTS | Kein Testverzeichnis unter app/ |
| Override = 'X' Downstream | index.tsx:133-134 isRegularShiftCode | KORREKT | 'X' nicht in REGULAR_SHIFT_CODES → Candidate übersprungen, kein Popup |
| Override = 'U' Downstream | index.tsx:133-134 isRegularShiftCode | KORREKT | 'U' nicht in REGULAR_SHIFT_CODES → analog |
| Leeres overrides-Objekt → Plan-Fallback | storage.ts:455-460 | KORREKT | `dateISO in overrides` false → weiter zu plan.entries |

---

## 4) QA-Entscheidung (Gate)

**Verdict: PASS WITH RISKS**

Fünf der sieben Findings aus Round 1 sind vollständig gefixt und per Code belegt: getShiftForDate Override (HIGH), Divergenz-Dokumentation (HIGH), AppState-Listener (MEDIUM), dismissedPromptKey-Kommentar (MEDIUM), Schnellstempel Warn-Text (MEDIUM). Das LOW-Finding (sortedEvents/displayEvents) ist im State-kritischen Teil behoben — shiftCases und daySummaries operieren auf dem vollen Array; das verbleibende Display-Limit der Anzeigeliste ist kein Blocking-Issue. Das INFO-Finding (Unit-Tests Overnight) ist als einziger Rückstand offen, hat aber keinen Gate-blockierenden Charakter. tsc Exit 0 und 37/37 Tests grün. Keine neuen Bugs durch die Fixes eingebracht — der AppState-Listener verwendet dieselbe `loadCurrentContext`/`loadData`-Callback-Referenz wie `useFocusEffect`, womit doppelte Trigger unschädlich sind. Der Overnight-Fix-Kern ist intakt.

---

## 5) Next Actions

1. **[INFO, Backlog]** Unit-Tests für `deriveTimeClockStampState` (leeres Array, 1 check_in, 1 Paar, anomaly) und Overnight-Pfad (`selectedShiftDateISO` mit yesterday-Priority) schreiben. Neue Datei `lib/__tests__/timeclock.test.ts`. Kein Gate-Blocker, aber wichtig für Regressionssicherheit.

2. **[LOW, optional]** Hinweistext in "Letzte Stempelzeiten"-Karte wenn `events.length > 30`: z.B. `"Ältere Einträge werden nicht angezeigt."` Kein Functional-Bug.

---

## Anhang: Finding-Tracking (alle 7 Vor-Findings)

| Finding | Severity | Round 1 | Round 2 | Notiz |
|---------|----------|---------|---------|-------|
| getShiftForDate Override | HIGH | NOT FIXED | FIXED | storage.ts:455-456: getShiftOverrides konsultiert, `in`-Guard + `?? null` |
| Popup vs. Service Divergenz | HIGH | NOT FIXED | FIXED | index.tsx:164-167 + timeclock.tsx:390-392: Kommentare vorhanden |
| AppState-Listener | MEDIUM | NOT FIXED | FIXED | index.tsx:236-243 + timeclock.tsx:359-366: Listener + Cleanup |
| dismissedPromptKey | MEDIUM | UNCHANGED | FIXED | index.tsx:97-98: In-Memory-Design dokumentiert |
| Schnellstempel Warn-Text | MEDIUM | NOT FIXED | FIXED | timeclock.tsx:666-670 + Style inlineWarningText:1101-1110 |
| sortedEvents State/Display | LOW | UNCHANGED | PARTIAL | shiftCases/daySummaries auf vollem Array (Zeile 369-370); displayEvents-Slice nur Anzeigeliste |
| Unit-Tests Overnight | INFO | NOT ADDED | NOT ADDED | Keine neuen Testdateien; shiftEngine 37/37 unverändert |
