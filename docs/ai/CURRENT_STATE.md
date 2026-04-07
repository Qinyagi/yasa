# YASA – Current State

## Letzte Iteration: Sprint A1 (Stabilisierung)
**Datum**: 2025-02-20
**Status**: QA PASS

## Feature-Matrix

| Feature | Iteration | Status |
|---------|-----------|--------|
| Profil erstellen (Obfuscated) | 1 | DONE |
| Space erstellen | 2 | DONE |
| Space beitreten (QR) | 3 | DONE |
| Dienstplan Setup (Pattern Editor) | 4 | DONE |
| Kalender (Monatsansicht, Scroll) | 5 | DONE |
| Startscreen Refactor | 6 | DONE |
| Heute-Ansicht (Kollegen) | 7 | DONE |
| Ghost-Mitglieder | 8 | DONE |
| Urlaub/Vacation | 9 | DONE |
| Schichttausch (Swap) | 10 | DONE |
| Swap Hotfixes (#1 Space-Check, #2 kein auto-X, #3 Datum-Validierung) | 10.1 | DONE |
| Services Hub | 14 | DONE |
| Admin Safetylock (3-Step, Biometric) | 14 | DONE |
| Calendar Modal + Pulse Animation | 14 | DONE |
| Startscreen v2 (Services CTA) | 16 | DONE |
| Refactor: Deduplizierung, SSOT Constants, dead code, any-Leaks | 17 | DONE |
| Hotfix: 2x useState\<any\> -> UserProfile \| null | 17.1 | DONE |
| Hotfix: isStrategyApplied .some()->.every() + acceptSwap Write-Order | 17.2 | DONE |
| Swap-Badge Notifications (Startscreen Banner + Services Hub Badge) | 18 | DONE |
| A1-02: Membership Guards (candidates, admin) | A1 | DONE |
| A1-03: Storage Write Patterns (auditiert, keine Aenderungen noetig) | A1 | DONE |
| A1-04: Ghost Cleanup bei deleteSpace | A1 | DONE |
| A1-05: Logging (lib/log.ts + 7 Integrationspunkte) | A1 | DONE |

## TypeScript Status
- `tsc --noEmit`: CLEAN (0 Fehler)
- `useState<any>` im app/: 0 Treffer
- `: any` im app/: 0 Treffer

## Architektur-Score: 8.5/10
## Security-Score: 7/10

## Bekannte technische Schuld
- Race Conditions bei Concurrent Writes (AsyncStorage read-modify-write) – akzeptiert fuer MVP
- Layout-Level Navigation Guards nur teilweise konsistent:
  - vorhanden in `(team)`, `(swap)`, `(services)` (Profil-Guard)
  - fehlen noch als einheitliches Muster in den restlichen Gruppen (TICKET-20 READY)
- ~~Ghost-Daten bleiben nach Space-Loeschung erhalten~~ GEFIXT (A1-04)
- Biometric Re-Auth nur einmal pro Focus (kein Timeout)
- formatGerman existiert in 2 lokalen Varianten (bewusst)
- Warning-Farben hardcoded statt in Theme (TICKET-23 Backlog)

## Aktuelle SSOT-Dokumente (2026-03)
- `docs/ai/TIME_DATA_OWNERSHIP_SHEET.md` (Datenhoheit Time/Regeln/Urlaub/Voice-Basis)

## Aktive Roadmap (Stand 2026-03-24)
- `docs/ai/NEXT_SESSION_ROADMAP_2026-03-24.md` ist die aktuellste gueltige Session-Roadmap.
- Scale-Readiness v1 Top-5 priorisiert: `docs/ai/SCALE_READINESS_TOP5_2026-03-25.md`

## Codebase-Analyse Check (2026-03-24)
- Stack bestaetigt: React Native `0.81.5`, Expo SDK `54`, Expo Router, TypeScript `5.9.2` strict.
- TypeScript-Qualitaet bestaetigt: in `app/lib/types/components/constants` keine `any`-Treffer.
- Projektstruktur bestaetigt: 8 Routing-Gruppen unter `app/`.
- Supabase-Status praezisiert: Client/Auth/Health-Bausteine in `lib/backend` vorhanden, aber noch ohne produktive Anbindung an Screens/Flows.
- Wartbarkeits-Hotspots bestaetigt:
  - `lib/storage.ts` hat `2010` Zeilen.
  - grosse Screens: `(shift)/setup.tsx` `1352`, `(services)/timeclock.tsx` `1342`, `(shift)/calendar.tsx` `1299`.
- Testabdeckung erweitert: 3 Engine-Testdateien (`shiftEngine`, `timeclock`, `strategyEngine`) + `timeAccountEngine`; keine UI-Test-Suite.

## Timeclock/TimeAccount Fortschritt (2026-03-24)
- Zentrale Engine aktiv: `lib/timeAccountEngine.ts`
- Stempeluhr + Urlaubs-/Freizeitkonto nutzen dieselbe Monatslogik (`Soll/Ist/Delta`)
- Tariflogik auf Intervallbasis (Feiertag/Vorfest-Split ueber Mitternacht)
- Gleitzeit-Regel aktiv: `credited = min(paidFlexMinutes, early + late)`
- Brueckentag-Strategie: Shift-plan-aware (24/7 vs. klassisch) in `lib/storage.ts`
- Strategie-Apply schreibt jetzt ebenfalls Day-Change-Historie (wie manuelles Urlaub-Setzen)
- KS/KN-Antragsreminder aktiv:
  wenn Urlaubstage auf `KS`/`KN` fallen, erzeugt YASA ein Pflicht-Reminder-Modal auf dem Startscreen
  mit Eskalation:
  - > 7 Tage vor Termin: per "Spaeter erinnern" ausblendbar
  - <= 7 Tage vor Termin: verpflichtend bis "Antrag eingereicht" bestaetigt wurde
- QA-Run dokumentiert: `docs/qa/timeclock_run_2026-03-24.md`
- QA-Override (Feiertag/Vorfest) bleibt temporaer aktiv bis Brueckentage/Strategie-Block fertig ist

## Offener Ausbaupunkt (naechster Schritt)
- Brueckentag/Strategie fuer `KS`/`KN` erweitern:
  statt pauschalem Voll-Urlaubstag auch "Stunden-Guthaben einsetzen" als Optimierungspfad anbieten
  (z. B. KS mit 5h Guthaben in ganzen freien Tag umwandeln, wenn Regelprofil es erlaubt).

## Update 2026-03-25 (Roadmap Block A/B)
- Strategie-Modus `Stunden einsetzen` ist jetzt integriert (`vacation` + `hours`).
- Strategieliste zeigt Typ-Badge, benoetigte Stunden und Antragshinweis.
- `hours`-Apply ist aktiv und setzt aktuell Frei-Overrides (`X`) fuer die vorgeschlagenen Tage.

## Update 2026-03-25 (Scale-Readiness Umsetzung)
- P0 abgeschlossen: serialisierte Writes fuer kritische Storage-Maps (`TIMECLOCK_EVENTS`, `SHIFT_OVERRIDES`, `DAY_CHANGES`, `VACATION_SHORTSHIFT_REMINDERS`).
- P1 abgeschlossen: Strategie-Logik in `lib/strategyEngine.ts` extrahiert; `storage.ts` dient als I/O-Adapter.
- P1 abgeschlossen: Testausbau mit `strategyEngine.test.ts`; Testlauf deckt `shiftEngine`, `timeclock`, `strategyEngine` ab.
- P2 gestartet: Retention/Compaction fuer Reminder, DayChanges und exakte Timeclock-Event-Duplikate aktiv.
- Scale-Status dokumentiert in `docs/ai/SCALE_READINESS_TOP5_2026-03-25.md`.

## Update 2026-03-25 (QA Re-Gate)
- Neuer QA-Gate fuer `Strategy Hours Bank + Scale Hardening`: `PASS`.
- Referenz: `reports/kilo/QA_review_2026-03-25_strategy_hours_bank_regate.md`.
- `QA_review_latest.md` in beiden Report-Pfaden auf den neuen Gate-Stand synchronisiert.
