# QA-Gate-Review: Next Actions Close – Override Fix + AppState + Konsistenz
**Datum:** 2026-03-25
**Reviewer:** YASA QA-Gate (automated senior review)
**Scope:** storage.ts getShiftForDate Override-Fix · index.tsx AppState · timeclock.tsx AppState + Konsistenz
**Referenz-Report:** QA_review_2026-03-25_timeclock_overnight_gate.md
**Build:** yasa v1.0.0 · tsc Exit 0 · Tests 37/37

---

## 1) Findings

### [HIGH] getShiftForDate ignoriert ShiftOverrides – NOT FIXED

- **Datei + Zeile:** `lib/storage.ts:451-459`
- **Risiko/Impact:** `getShiftForDate` liest ausschließlich `plan.entries` und konsultiert `getShiftOverrides` nicht. Die Funktion ist seit dem Vor-Review unverändert. Damit bleibt der im Vor-Report beschriebene Fehler vollständig aktiv: Bei einem Override (z.B. Basisplan = "F", Override = "N") gibt `detectStampPrompt` in `index.tsx:131` und `loadData` in `timeclock.tsx:310-311` den Basis-Schichtcode zurück – nicht den Override. Das Popup erscheint für das falsche Zeitfenster oder gar nicht.
- **Reproduktion:**
  1. Schichtplan enthält für 2026-03-25 Code "F" in `plan.entries`
  2. Benutzer setzt Override "N" für dieses Datum via `setShiftOverride`
  3. `getShiftForDate(profileId, '2026-03-25')` gibt "F" zurück (Override ignoriert)
  4. `detectStampPrompt` berechnet Zeitfenster für "F" (06:00 ± Flex) statt "N" (22:00 ± Flex)
  5. Popup erscheint nicht zur Nachtdienstzeit, obwohl Override aktiv
- **Edge-Case Override = 'X':** Da der Override nie gelesen wird, ist der Frei-Override ebenfalls unausgewertet. Kein Regressions-Schutz für diesen Pfad.
- **Empfehlung:** `getShiftForDate` muss nach `getShiftOverrides(profileId)` greifen und `return overrides[dateISO] ?? entry?.code ?? null` zurückgeben. Bereits spezifiziert im Vor-Report.

---

### [HIGH] Undokumentierte Divergenz Startscreen-Popup vs. Service-Screen – NOT FIXED

- **Datei + Zeile:** `app/index.tsx:130-186` und `app/(services)/timeclock.tsx:373-382`
- **Risiko/Impact:** Kein einziger Kommentar wurde hinzugefügt, der erklärt, dass der Service-Screen einen offenen Dienst weiterhin zeigt (event-basiert, unabhängig vom Zeitfenster), während das Startscreen-Popup nach Ablauf von `endWindowTo` (Schichtende + `postShiftGraceMinutes`) nicht mehr erscheint. Die unterschiedliche fachliche Wahrheit beider Screens ist im Code komplett undokumentiert. Entwickler, die diesen Code später lesen, können das Verhalten nicht ohne Tracing ableiten. Der Vor-Report klassifizierte dies als HIGH.
- **Konkrete Lücken:**
  - `index.tsx:162-173`: Keine Kommentarzeile, die erklärt warum `inEndWindow` als Gate fungiert und was nach Ablauf des Fensters passiert (Popup schweigt, Service-Screen zeigt weiter)
  - `timeclock.tsx:373-382`: Kein Kommentar, der erklärt dass `selectedShiftDateISO` rein event-basiert ist und auch nach Ablauf des Kulanzfensters auf "gestern" zeigt
- **Empfehlung:** Kommentare an beiden Stellen einbauen, wie im Vor-Report formuliert.

---

### [MEDIUM] Kein AppState-Listener – NOT FIXED

- **Datei + Zeile:** `app/index.tsx:192-235`, `app/(services)/timeclock.tsx:346-356`
- **Risiko/Impact:** Weder `index.tsx` noch `timeclock.tsx` importieren `AppState` aus `react-native`. Es gibt keinen `AppState.addEventListener('change', ...)` Aufruf in beiden Dateien. Wie im Vor-Report beschrieben: Bei App-Rückkehr aus dem Hintergrund ohne Screen-Wechsel wird kein Reload ausgelöst. `useFocusEffect` ist der einzige Reload-Trigger. Das heißt: Wenn die App im Hintergrund war (z.B. Sperrbildschirm) und wieder in den Vordergrund kommt – ohne dass der Benutzer navigiert – bleibt der Stempeluhr-Status stale.
- **Szenario B-Analyse (Mitternacht, App im Vordergrund):** Kein AppState-Listener bedeutet auch kein 00:00-Trigger. Für Overnight-Dienste ist dies nach wie vor unkritisch (candidateDates enthält `yesterday` bereits). Für einen Frühdienststart (neuer Tag) kann das Popup erst beim nächsten useFocusEffect erscheinen.
- **Cleanup-Lücke:** Da kein Listener existiert, gibt es auch kein fehlerhaftes Cleanup – aber das ist ein Nicht-Vorhandensein, kein Fix.
- **Empfehlung:** `AppState`-Listener mit `active` → re-run `load()` implementieren, Cleanup im useFocusEffect-Return.

---

### [MEDIUM] dismissedPromptKey nicht persistent – UNCHANGED, nicht dokumentiert

- **Datei + Zeile:** `app/index.tsx:96`
- **Status:** `useState<string | null>(null)` – unverändert, kein AsyncStorage-Persist, kein Code-Kommentar zur bewussten Design-Entscheidung hinzugefügt.
- **Impact:** Die Nicht-Persistenz ist nicht explizit dokumentiert. Ein Entwickler, der diesen Code liest, kann nicht erkennen, ob das absichtlich ist (Popup nach App-Restart erneut zeigen) oder ein bekannter Rückstand ist. Der Vor-Report forderte explizit Dokumentation oder Implementation.
- **Empfehlung:** Mindestens einen Kommentar hinzufügen: `// Bewusst in-memory: Popup nach App-Restart erneut zeigen. Für persistentes Dismiss → AsyncStorage mit TTL.`

---

### [MEDIUM] Schnellstempel-Warn-Text bei Divergenz – NOT FIXED

- **Datei + Zeile:** `app/(services)/timeclock.tsx:613-657` (Schnellstempel-Card, UI-Render-Block)
- **Risiko/Impact:** Das `helperText`-Feld (Zeile 644-653) zeigt den aktuellen Status des ausgewählten Diensttages. Es enthält keinen visuellen Warnhinweis, wenn `selectedEventType !== selectedShiftState.allowedEventType`. Der Benutzer kann Kommen/Gehen-Chip manuell auf den falschen Typ stellen, erhält aber erst beim Tap auf "Jetzt stempeln" einen Alert (`handleQuickStamp:476-481`). Kein proaktiver, prominenter Warn-Text vor dem Tap.
- **Was vorhanden ist:** `useEffect` (Zeile 394-398) korrigiert `selectedEventType` automatisch auf `allowedEventType`, wenn `allowedEventType !== null`. Das deckt den Normalfall ab. Die Lücke: Wenn `selectedShiftState.allowedEventType === null` (Phase `completed` oder `anomaly`) und der Benutzer trotzdem einen Event-Typ auswählt, gibt es keinen UI-Hinweis vor dem Tap.
- **Nicht gefixt:** Kein inline `{selectedEventType !== selectedShiftState.allowedEventType && ...}` Warn-Text im JSX.
- **Empfehlung:** Conditional inline warning text unter den Chips, sichtbar vor dem Stempel-Button.

---

### [LOW] sortedEvents.slice(0,30) für State-Berechnung – NOT FIXED

- **Datei + Zeile:** `app/(services)/timeclock.tsx:358-359`
- **Aktueller Stand:** `const sortedEvents = useMemo(() => events.slice(0, 30), [events]);` – unverändert. `shiftCases` und `daySummaries` basieren auf `sortedEvents` (dem Slice). `monthSummary` und `selectedShiftDateISO`/`selectedShiftEvents` basieren korrekt auf dem vollen `events`-Array.
- **Partial-Fix-Bewertung:** Die State-kritischen Pfade (`monthSummary` auf Zeile 362-371, `selectedShiftDateISO` auf Zeile 373-382, `selectedShiftEvents` auf Zeile 384-387) verwenden bereits das volle `events`-Array. Das bedeutet das Overnight-Fix-Kernpfad ist nicht betroffen. Die Schichtfälle-Übersicht (`shiftCases`, `daySummaries`) ist aber weiterhin auf 30 Events begrenzt. Bei mehr als ~15 Schichtpaaren werden ältere Fälle in der Liste ausgeblendet.
- **Einschätzung:** Das Finding ist in seinem kritischsten Teilaspekt (Overnight-State) nicht reproduzierbar. Die Display-Begrenzung bleibt aber als latentes Problem für Heavy-User offen.

---

### [INFO] Unit-Tests für deriveTimeClockStampState/Overnight-Pfad – NOT ADDED

- **Datei:** `lib/__tests__/shiftEngine.test.ts`, `lib/__tests__/timeAccountEngine.test.ts`
- **Befund:** Keine neuen Tests für `deriveTimeClockStampState`, `selectedShiftDateISO`-Overnight-Pfad oder `detectStampPrompt`. Die Testdatei `shiftEngine.test.ts` deckt unverändert 37 Tests für die shiftEngine-Funktionen ab. `timeAccountEngine.test.ts` deckt Intervall/Flex-Regeln ab (2 Cases). Kein neues `timeclock.test.ts` oder `stampState.test.ts` existiert im Verzeichnis `lib/__tests__/`.
- **Risiko:** Regressionssicherheit für den Overnight-Stempelpfad bleibt ausschließlich manuell.

---

## 2) Verifizierte Stärken

**1. Overnight-Fix-Kern intakt (keine Regression).** `selectedShiftDateISO`-Memo (timeclock.tsx:373-382) und zweistufige Priorität in `detectStampPrompt` (index.tsx:162-185) sind unverändert und korrekt. Der ursprüngliche Bug (Status-Reset nach 00:00) ist weiterhin gefixt.

**2. monthSummary auf vollem events-Array.** `computeMonthlyWorkProgress` (timeclock.tsx:362-371) erhält das ungeslicete `events`-Array – korrekt für die Monatsberechnung.

**3. selectedShiftDateISO und selectedShiftEvents auf vollem events-Array.** Die State-kritischen Memos (Zeilen 373-387) operieren auf dem vollen Array. Overnight-Pfad ist nicht durch den `sortedEvents`-Slice beeinträchtigt.

**4. handleQuickStamp Guard-Logik intakt.** Die drei Guards (completed, anomaly, allowedEventType mismatch) in handleQuickStamp (Zeilen 458-482) verhindern zuverlässig fehlerhafte Stempelungen. Der `allowedEventType !== selectedEventType`-Check (Zeile 476) ist korrekt implementiert.

**5. tsc Exit 0 – keine neuen Typfehler.** Der Codestand ist TypeScript-strict-clean. Keine Regressions durch mögliche Änderungen.

**6. Tests 37/37 PASS – shiftEngine-Invarianten stabil.** Alle Kernel-Invarianten für Schichtplan-Berechnungen weiterhin grün.

**7. getShiftOverrides-Funktion in storage.ts vorhanden und korrekt implementiert.** Die Infrastruktur für den Override-Fix (Zeilen 1020-1079) ist vollständig vorhanden. `getShiftOverrides` liest `KEYS.SHIFT_OVERRIDES`, gibt `Record<string, ShiftType>` zurück. Die einzige fehlende Brücke ist die Einbindung in `getShiftForDate`.

---

## 3) Test-/Check-Protokoll

| Check | Command | Ergebnis | Notiz |
|-------|---------|----------|-------|
| TypeScript | `cd yasa && npx tsc --noEmit` | PASS – Exit 0 | Keine neuen Typfehler |
| Unit Tests (shiftEngine) | `cd yasa && npm test` | PASS – 37/37 | Unverändert, keine neuen Tests |
| AppState-Import in index.tsx | Grep `AppState` in app/ | NOT FOUND | Kein Listener implementiert |
| AppState-Import in timeclock.tsx | Grep `AppState` in app/ | NOT FOUND | Kein Listener implementiert |
| getShiftForDate Override-Konsultation | Grep `getShiftOverrides` in storage.ts:451-459 | NOT FOUND | Override-Fix nicht implementiert |
| Divergenz-Kommentar index.tsx | Grep `postShiftGrace.*comment` etc. | NOT FOUND | Keine Dokumentation hinzugefügt |
| Divergenz-Kommentar timeclock.tsx | Grep `Fenster.*abgelaufen` etc. | NOT FOUND | Keine Dokumentation hinzugefügt |
| dismissedPromptKey Kommentar | Grep `persistent\|in.memory` in index.tsx | NOT FOUND | Keine Dokumentation hinzugefügt |
| Schnellstempel Warn-Text | Grep `selectedEventType.*selectedShiftState` JSX | NOT FOUND | Nur Alert in handleQuickStamp, kein inline warn |
| sortedEvents State/Display-Trennung | Zeile 358-359 timeclock.tsx | NOT FIXED | Slice unverändert, aber State-Pfade korrekt auf vollem Array |
| deriveTimeClockStampState Tests | Glob `**/*.test.ts` in lib/__tests__ | NOT ADDED | Nur shiftEngine + timeAccountEngine Tests |

---

## 4) QA-Entscheidung (Gate)

**Verdict: FAIL**

Alle sieben Findings aus dem Vor-Report sind ohne Ausnahme offen. Kein einziges der geforderten Next-Action-Items wurde implementiert oder dokumentiert. Der höchstkritische HIGH-Fix (`getShiftForDate` Override-Konsultation) fehlt vollständig – damit ist die Stempeluhr bei allen Benutzern mit aktiven Schicht-Overrides fachlich falsch. Das zweite HIGH-Finding (undokumentierte Popup-vs.-Service-Screen-Divergenz) ist ebenfalls nicht adressiert. Der Codestand ist gegenüber dem Vor-Review-Stand bitidentisch in allen geprüften Bereichen. Da der Vor-Report explizit einen Fix-Zyklus vor dem nächsten Gate verlangte und keiner der Änderungspunkte umgesetzt wurde, muss das Gate FAIL vergeben werden. Die verifizierten Stärken (Overnight-Fix-Kern intakt, tsc clean, Tests grün) sind positiv, ändern aber nichts an der Nicht-Umsetzung der Next Actions.

---

## 5) Next Actions

1. **[HIGH, blocking]** `getShiftForDate` in `lib/storage.ts:451-459` um Override-Konsultation erweitern: `const overrides = await getShiftOverrides(profileId); return overrides[dateISO] ?? entry?.code ?? null;`. Ohne diesen Fix ist kein erneutes Gate möglich.

2. **[HIGH, blocking]** Kommentar in `app/index.tsx` vor Zeile 162 (check_out-Prioritätsschleife) und in `app/(services)/timeclock.tsx` vor Zeile 373 (selectedShiftDateISO-Memo): Klare Dokumentation, dass nach `endWindowTo`-Ablauf kein Popup mehr erscheint, der Service-Screen aber weiterhin den offenen Dienst anzeigt.

3. **[MEDIUM, vor nächstem Gate]** `AppState`-Listener in `index.tsx` und `timeclock.tsx` implementieren: `AppState.addEventListener('change', (state) => { if (state === 'active') load(); })` mit Cleanup. Verhindert stale-Date-Bugs nach Hintergrund-Resume ohne Navigation.

4. **[MEDIUM, vor nächstem Gate]** `dismissedPromptKey` in `app/index.tsx:96` explizit kommentieren (mindestens: bewusste In-Memory-Entscheidung dokumentieren). Optional: AsyncStorage-Persist mit kurzer TTL (z.B. 1h).

5. **[MEDIUM, vor nächstem Gate]** Inline Warn-Text im Schnellstempel-Block (timeclock.tsx) einbauen: Wenn `selectedShiftState.allowedEventType !== null && selectedEventType !== selectedShiftState.allowedEventType`, prominenter Hinweistext sichtbar vor dem Stempel-Button.

6. **[LOW, Backlog]** `sortedEvents`-Slice (timeclock.tsx:358) vom Display-Limit trennen: Variable `displayEvents = events.slice(0, 30)` nur für "Letzte Stempelzeiten"-Liste; `shiftCases` und `daySummaries` auf das volle `events`-Array umstellen.

7. **[INFO, Backlog]** Unit-Tests für `deriveTimeClockStampState` (leeres Array, 1 check_in, 1 Paar, anomaly) und Overnight-Pfad (`selectedShiftDateISO` mit yesterday-Priority) schreiben. Neue Datei `lib/__tests__/timeclock.test.ts`.

---

## Anhang: Finding-Status aus Vor-Review

| Finding | Severity | Status | Notiz |
|---------|----------|--------|-------|
| getShiftForDate Override | HIGH | NOT FIXED | storage.ts:451-459 identisch mit Vor-Review-Stand; getShiftOverrides wird nicht konsultiert |
| Popup vs. Service Divergenz | HIGH | NOT FIXED | Kein Kommentar in index.tsx oder timeclock.tsx hinzugefügt |
| AppState-Listener | MEDIUM | NOT FIXED | Kein AppState-Import, kein Listener in index.tsx oder timeclock.tsx |
| dismissedPromptKey | MEDIUM | UNCHANGED | Weiterhin useState in-memory; keine Dokumentation zur bewussten Design-Entscheidung |
| Schnellstempel Warn-Text | MEDIUM | NOT FIXED | Kein inline Warn-Text; nur Alert im handleQuickStamp-Handler (war bereits vorhanden) |
| sortedEvents State/Display | LOW | UNCHANGED | Slice unverändert; State-Pfade (selectedShiftDateISO, monthSummary) korrekt auf vollem Array – latentes Display-Problem bleibt |
| Unit-Tests Overnight | INFO | NOT ADDED | Keine neuen Testdateien für deriveTimeClockStampState oder Overnight-Pfad |
