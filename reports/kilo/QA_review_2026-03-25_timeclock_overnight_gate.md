# QA-Review: Overnight Timeclock Bug Fix
**Datum:** 2026-03-25
**Reviewer:** YASA QA / Senior Review (automated gate)
**Scope:** Overnight-Stempeluhr-Fix (timeclock.tsx + index.tsx)
**Build:** yasa v1.0.0 · React Native 0.81.5 · Expo SDK 54 · TypeScript 5.9.2 strict

---

## Abschnitt 1: Findings

---

### [FIXED – verified] Overnight-Mitternachtsübergang: Status springt nicht zurück auf "Kommen"

- **Datei + Zeile:** `app/(services)/timeclock.tsx:373-382` (`selectedShiftDateISO` memo)
- **Risiko/Impact:** Ursprünglich war dies der gemeldete Bug: Nach 00:00 Uhr wurde shiftDateISO neu auf "heute" gesetzt, wodurch kein Event für dieses neue "heute+N" existierte und der Status auf `awaiting_check_in` zurückfiel.
- **Fix-Mechanismus:** Das Memo `selectedShiftDateISO` prüft zuerst, ob der gestrige Tag für den gewählten Schichtcode im Status `awaiting_check_out` ist. Ist das der Fall, bleibt `shiftDateISO = yesterday`. Nur wenn gestern kein offener Dienst vorliegt, wird `today` verwendet.
- **Verifikation:** `deriveTimeClockStampState` gibt `awaiting_check_out` zurück, solange genau ein check_in ohne check_out vorliegt. Das ist datumsstabil – die Funktion operiert ausschließlich auf dem Event-Array, nicht auf der Uhrzeit.
- **Bewertung:** FIXED – verified. Der Bug ist durch das `selectedShiftDateISO`-Memo korrekt abgefangen.

---

### [FIXED – verified] index.tsx detectStampPrompt: Overnight-Priorität check_out vor check_in

- **Datei + Zeile:** `app/index.tsx:121-185` (`detectStampPrompt`)
- **Risiko/Impact:** Gleiches Problem wie oben, aber am Startscreen-Popup-Einstieg.
- **Fix-Mechanismus:** `candidateDates = [yesterday, today]`. Für jeden Kandidaten wird `deriveTimeClockStampState` aufgerufen. Die erste Priorität-Schleife (Zeilen 163-173) liefert `check_out` wenn `inEndWindow && phase === 'awaiting_check_out'`. Erst danach folgt die check_in-Schleife. Somit wird nach 00:00 der gestrige offene Dienst korrekt priorisiert.
- **Zusatzbedingung:** `inEndWindow` muss aber auch `true` sein. Nach 00:00 Uhr liegt die Endzeit des N-Dienstes (z.B. 06:00+Kulanz) noch innerhalb des Fensters → check_out wird korrekt angeboten.
- **Bewertung:** FIXED – verified.

---

### [HIGH] shiftDateISO-Bestimmung in index.tsx nicht spiegelgleich mit timeclock.tsx

- **Datei + Zeile:** `app/index.tsx:130-160` vs. `app/(services)/timeclock.tsx:373-382`
- **Risiko/Impact:** In `timeclock.tsx` wird `selectedShiftDateISO` rein auf Basis der vorhandenen Events bestimmt (`awaiting_check_out` → yesterday). In `index.tsx` (`detectStampPrompt`) ist die Logik komplexer: Sie prüft zusätzlich das Zeitfenster (`inEndWindow`). Das bedeutet: Nach Ablauf des `endWindowTo` (Schichtende + postShiftGraceMinutes) findet `index.tsx` keinen `check_out`-Kandidaten mehr – obwohl `timeclock.tsx` weiterhin `yesterday` als shiftDateISO anzeigt. Beide zeigen dann unterschiedliche fachliche Wahrheit.
- **Reproduktion:**
  1. N-Dienst 21:45–06:00, postShiftGraceMinutes = 30
  2. Check-in um 21:45, kein Check-out
  3. Nach 06:30 Uhr: `timeclock.tsx` zeigt weiterhin `yesterday · N · awaiting_check_out`
  4. `index.tsx` Popup erscheint nicht mehr (kein Kandidat in Fenster)
  5. User sieht im Service-Screen "offen seit", aber bekommt kein Popup auf dem Startscreen
- **Empfehlung:** Das ist ein gewünschtes Verhalten ("Popup nur innerhalb Kulanzfenster"), aber es sollte explizit dokumentiert und per Kommentar im Code erklärt sein. Wenn das Verhalten ungeplant divergiert, muss in `timeclock.tsx` ebenfalls ein Hinweis eingebaut werden ("Fenster abgelaufen, manuelle Stempelung erforderlich").

---

### [HIGH] getShiftForDate ignoriert ShiftOverrides

- **Datei + Zeile:** `lib/storage.ts:451-459` (`getShiftForDate`)
- **Risiko/Impact:** `getShiftForDate` liest ausschließlich `plan.entries` und ignoriert `SHIFT_OVERRIDES` komplett. Wenn ein Benutzer für einen Tag einen Override gesetzt hat (z.B. N-Dienst statt F), wird der Override in `detectStampPrompt` (index.tsx) und in `loadData` (timeclock.tsx) nicht berücksichtigt. Der Stempeluhr-Popup erscheint für den falschen Schichtcode oder gar nicht.
- **Reproduktion:**
  1. Schichtplan hat für 2026-03-25 "F"
  2. Benutzer setzt Over­ride auf "N" für diesen Tag
  3. `detectStampPrompt` schaut unter `shiftCode = F` nach Events → `shiftSettings[F]` Zeitfenster → findet nichts zur N-Dienstzeit
  4. Popup zeigt "Frühschicht" statt "Nachtschicht"
- **Empfehlung:** `getShiftForDate` muss `getShiftOverrides(profileId)` konsultieren: `return overrides[dateISO] ?? entry?.code ?? null`.

---

### [MEDIUM] Kein AppState-Listener: Datumswechsel bei laufender App ohne Focus-Event

- **Datei + Zeile:** `app/index.tsx:192-235`, `app/(services)/timeclock.tsx:346-356`
- **Risiko/Impact:** Beide Screens re-evaluieren den Stempelstatus ausschließlich via `useFocusEffect`. Es gibt keinen `AppState`-Listener. Wenn die App nach Mitternacht im Vordergrund verbleibt (Gerät nicht gesperrt, Benutzer navigiert nicht), ruft kein Trigger `todayISO()` neu auf. In diesem Edge-Case kann `candidateDates` auf einem veralteten "heute" basieren, was jedoch im Overnight-Szenario irrelevant ist, da `yesterday` (der korrekte Schichttag) bereits in den Kandidaten enthalten ist.
- **Einschränkung:** Wenn der Benutzer sich genau um 00:00 auf dem Startscreen befindet ohne zu navigieren, könnte ein neuer Tag-Kandidat (neues "today") erst beim nächsten useFocusEffect geladen werden. Für Overnight-Nachtdienst ist das unkritisch (der gestrige Kandidat ist immer dabei), aber für einen Frühdienststart könnte sich das Popup um einige Minuten verzögern.
- **Empfehlung:** `AppState` change listener (`active` → re-run load) hinzufügen. Alternativ: Interval-Refresh alle 60s bei aktivem Screen.

---

### [MEDIUM] dismissedPromptKey: In-Memory-only, kein Persist

- **Datei + Zeile:** `app/index.tsx:96` (`useState<string | null>(null)`)
- **Risiko/Impact:** Wenn der Benutzer das Popup mit "Später" dismisst und die App danach neu startet (oder das Gerät neu gestartet wird), ist `dismissedPromptKey` auf `null` zurückgesetzt. Das Popup erscheint erneut beim ersten Focus-Event. Das ist möglicherweise gewollt (Popup nach App-Restart neu anzeigen), aber kann als störend empfunden werden.
- **Szenario C (App-Restart nach 00:00 mit offenem Check-in):** Beim App-Restart ist `dismissedPromptKey = null`. `detectStampPrompt` lädt den gestrigen offenen Dienst erneut und zeigt das Popup korrekt. Der Status ist korrekt wiederhergestellt. Keine falschen Resets.
- **Empfehlung:** Explizit im Code dokumentieren, ob das bewusste Nicht-Persistenz ist. Falls "Später" über App-Restarts hinaus gelten soll, muss `dismissedPromptKey` in AsyncStorage gespeichert werden (mit TTL).

---

### [MEDIUM] Szenario D: Schnellstempel-Status und Popup-Status können divergieren

- **Datei + Zeile:** `app/(services)/timeclock.tsx:389-392` vs. `app/index.tsx:163-185`
- **Risiko/Impact:** Der Schnellstempel in `timeclock.tsx` verwendet `selectedShiftDateISO` (memo, rein event-basiert) und `selectedShiftCode` (UI-State, manuell wählbar). Das Popup in `index.tsx` verwendet `detectStampPrompt` (zeitfenster-basiert, automatisch). Wenn der Benutzer im Schnellstempel manuell einen anderen Schichtcode auswählt als den, den das Popup anzeigt, stempeln beide auf unterschiedliche shiftCodes. Das ist architektonisch korrekt (zwei unabhängige Eingabepfade), aber es fehlt jegliche visuelle Warnung im Schnellstempel-Bereich, wenn der aktuelle Status nicht mit dem erwarteten Stempel-Typ übereinstimmt.
- **Empfehlung:** Im Schnellstempel einen Warntext einblenden wenn `selectedShiftState.allowedEventType !== selectedEventType` (dieser Check existiert in `handleQuickStamp`, Zeile 476, aber der UI-Status-Text zeigt das nicht prominent genug an).

---

### [LOW] sortedEvents auf 30 Einträge begrenzt, aber shiftCases arbeiten auf dem Slice

- **Datei + Zeile:** `app/(services)/timeclock.tsx:358-359`
- **Risiko/Impact:** `sortedEvents = events.slice(0, 30)` – der Slice wird für `shiftCases` verwendet. Wenn ein Benutzer mehr als ~15 Schichtfälle hat (2 Events je Fall), werden ältere Fälle aus der Übersicht ausgeblendet. Die `buildShiftCases`-Funktion gruppiert nach `dateISO|shiftCode` – ein über 30 Events hinausgehender offener Check-in würde ausgeblendet. In der Praxis unwahrscheinlich aber ein latentes Problem.
- **Empfehlung:** `sortedEvents` für die Statusanzeige vom Display-Limit trennen: Vollständige Events für State-Berechnung, limitierte für die visuelle Liste.

---

### [LOW] toTimestampISO in timeclock.tsx: Local-Time-basiert ohne Timezone-Normierung

- **Datei + Zeile:** `app/(services)/timeclock.tsx:125-130` (`toTimestampISO`)
- **Risiko/Impact:** `new Date(y, m-1, d, hh, mm, 0, 0).toISOString()` produziert einen UTC-ISO-String basierend auf der lokalen Systemzeit. Das ist konsistent mit dem Rest der App (dieselbe Pattern in storage.ts `formatDateISO`). Kein Bug, aber ein bekanntes DST-Risiko falls das Gerät in einer Nicht-MEZ-Zeitzone verwendet wird.
- **Empfehlung:** Für eine produktionsreife App dokumentieren, dass alle Timestamps local-time-basiert sind und keine Timezone-Metadata tragen.

---

### [INFO] Kein dedizierter Test für Overnight-Stempellogik

- **Datei + Zeile:** `lib/__tests__/shiftEngine.test.ts` (37 Tests, alle shiftEngine-bezogen)
- **Risiko/Impact:** `deriveTimeClockStampState`, `detectStampPrompt` und `selectedShiftDateISO` sind nicht durch automatisierte Unit-Tests abgedeckt. Der QA-Run vom 2026-03-24 war ein manueller Produkt-Run (PASS). Regression ist nur durch erneutes manuelles Testen feststellbar.
- **Empfehlung:** Unit-Tests für `deriveTimeClockStampState` (leeres Array, 1 check_in, 1 check_in + 1 check_out, anomaly) und Integrationstests für den `selectedShiftDateISO`-Overnight-Pfad hinzufügen.

---

### [INFO] Storage-Key `TIMECLOCK_UI` in timeclock.tsx verwendet, aber nicht in index.tsx

- **Datei + Zeile:** `app/(services)/timeclock.tsx:307` (`getTimeClockUiState`)
- **Risiko/Impact:** `settingsExpanded`-State wird in AsyncStorage persistiert. Kein funktionaler Fehler.
- **Empfehlung:** Kein Handlungsbedarf.

---

## Abschnitt 2: Verifizierte Stärken

**1. Overnight-Fix-Architektur ist solid.** Das `selectedShiftDateISO`-Memo in `timeclock.tsx` (Zeilen 373-382) und die zweistufige Priorität in `detectStampPrompt` (index.tsx Zeilen 162-185) lösen das Kernproblem sauber: Die Bestimmung des Schichttages erfolgt event-basiert (nicht zeitbasiert), was nach 00:00 korrekt auf "gestern" zeigt, solange kein check_out vorliegt.

**2. `deriveTimeClockStampState` ist deterministisch und datumsstabil.** Die Funktion in `lib/storage.ts:1716-1782` operiert ausschließlich auf dem Event-Array und hat keine Zeitabhängigkeit. Ein offenes check_in bleibt `awaiting_check_out` unabhängig davon, wann die Funktion aufgerufen wird.

**3. Prioritätsregel "check_out vor check_in" korrekt implementiert.** In `index.tsx:162-185` wird eine separate Schleife für check_out-Kandidaten vor der check_in-Schleife durchgeführt. Szenario B (offene Schicht gestern + neuer Dienst heute) wird korrekt abgehandelt.

**4. shiftDateISO wird beim Event-Speichern korrekt aus dem Memo genommen.** In `handleQuickStamp` (timeclock.tsx:487) wird `selectedShiftDateISO` (das korrekt auf "gestern" zeigt) als `dateISO` im Event gespeichert. Keine off-by-one.

**5. TypeScript strict: 0 Fehler.** `tsc --noEmit` sauber. Keine `any`-Lecks im relevanten Pfad.

**6. Unit-Tests Engine: 37/37 PASS.** Shift-Engine-Invarianten sind vollständig abgedeckt.

**7. Overnight-Zeitberechnung in detectStampPrompt korrekt.** `endAt <= startAt` → `endAt += 24h` (index.tsx:137-139). Ein N-Dienst 21:45–06:00 hat korrekt endAt = 06:00 des Folgetages, bezogen auf das shiftDateISO des Starttages. `endWindowTo` liegt damit nach 06:00+GraceMinutes des Folgetages.

---

## Abschnitt 3: Test-/Check-Protokoll

| Check | Command | Ergebnis |
|-------|---------|----------|
| TypeScript | `cd yasa && npx tsc --noEmit` | PASS – 0 Fehler (Exit 0) |
| Unit Tests (shiftEngine) | `cd yasa && npm test` | PASS – 37/37 Tests grün |
| Unit Tests (deriveTimeClockStampState) | n/a – kein Test vorhanden | NICHT AUSGEFÜHRT – kein Test |
| Unit Tests (detectStampPrompt) | n/a – kein Test vorhanden | NICHT AUSGEFÜHRT – kein Test |
| Maestro E2E timeclock | `npm run qa:e2e:timeclock` | NICHT AUSGEFÜHRT – Infra-Blocker bekannt (docs/qa/timeclock_run_2026-03-24.md) |
| Manueller QA-Run 2026-03-24 | siehe timeclock_run_2026-03-24.md | PASS (manuell, N-Dienst 21:45–06:01, Feiertag/Vorfest-Split korrekt) |

---

## Abschnitt 4: QA-Entscheidung

**Verdict: PASS WITH RISKS**

Der ursprüngliche Bug (Status-Reset nach 00:00 bei offenem Nachtdienst) ist in beiden Einstiegspunkten (timeclock.tsx Schnellstempel und index.tsx Popup) nachweislich gefixt. Die Logik basiert auf event-basierter Datumszuordnung anstelle von zeitbasierter, was architektonisch korrekt ist. Die kritischen Szenarien A (Overnight-N-Dienst) und C (App-Restart) sind durch den Code korrekt abgehandelt. Zwei HIGH-Findings bleiben offen: `getShiftForDate` ignoriert ShiftOverrides (Impakt: falscher Schichtcode bei Overrides) und der Fachstatus-Split zwischen Service-Screen und Startscreen nach Ablauf des Kulanzfensters ist undokumentiert. Ohne automatisierte Tests für die Overnight-Logik bleibt Regressionssicherheit ausschließlich durch manuellen Re-Test gegeben.

---

## Abschnitt 5: Next Actions

1. **[HIGH, sofort]** `getShiftForDate` in `lib/storage.ts:451-459` um Override-Konsultation erweitern: `return overrides[dateISO] ?? entry?.code ?? null`. Ohne diesen Fix ist die Stempeluhr bei Schicht-Overrides fachlich falsch.

2. **[HIGH, kurzfristig]** Divergenz zwischen Service-Screen und Startscreen nach Kulanzfensterablauf explizit dokumentieren. Kommentar in `timeclock.tsx` und `index.tsx` einbauen, der erklärt, dass der Startscreen-Popup nach `postShiftGraceMinutes` nicht mehr erscheint, der Service-Screen aber weiterhin den offenen Dienst anzeigt.

3. **[MEDIUM, kurzfristig]** `AppState`-Listener in `index.tsx` und `timeclock.tsx` hinzufügen, der bei App-Rückkehr in den Vordergrund (`active`) einen Reload auslöst. Verhindert stale-Date-Bugs bei langläufiger App ohne Screen-Wechsel.

4. **[INFO, mittelfristig]** Unit-Tests für `deriveTimeClockStampState` und den Overnight-Pfad von `selectedShiftDateISO`/`detectStampPrompt` schreiben. Ziel: Automatisierte Regressionssicherheit für den gesamten Stempeluhr-Kernpfad ohne Maestro-Infra-Abhängigkeit.

5. **[LOW, Backlog]** `sortedEvents.slice(0, 30)` in `timeclock.tsx:358` vom Display-Limit trennen: Vollständige Events für State/Memo-Berechnung, limitierter Slice nur für das Rendering der Event-Liste.
