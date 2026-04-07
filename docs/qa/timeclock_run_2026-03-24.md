# Timeclock QA Run - 2026-03-24

## Ziel
Validierung der neuen Intervall-Logik fuer Nachtdienst mit Mitternachts-Split sowie Gleitzeit-Regel.

## Setup
1. QA-Override aktiv:
- `2026-03-24` -> `Vorfest (QA)`
- `2026-03-25` -> `Feiertag (QA)`
2. Schichtfall:
- `Kommen`: `2026-03-24 21:45`, Schicht `N`
- `Gehen`: `2026-03-24 06:01`, Schicht `N` (Overnight-Interpretation)

## Erwartung
1. Vorfest-Minuten bis 00:00.
2. Feiertags-Minuten ab 00:00.
3. Gleitzeit-Credit nach Regel `min(paidFlex, early + late)`.

## Ergebnis (manuell verifiziert)
1. `Feiertag / Vorfest`: `6,02 / 2,25` -> PASS
2. `Gleitzeit angerechnet (Regel)`: `0,25` -> PASS
3. `Ist bisher`: `8,27 h` -> PASS

## Bugfixes waehrend Run
1. Overnight-Paarung: `Gehen` bei kleinerer Uhrzeit wird bei Nachtdienst auf Folgetag verschoben.
2. Paar-Reihenfolge: Sortierung fuer Paarbildung auf `createdAt` (mit `timestampISO` als Fallback), damit bearbeitete Zeiten robust bleiben.

## Automation-Status
1. Maestro-Flow erstellt:
- `.maestro/timeclock/01_timeclock_qa_interval_split.yaml`
2. Runner erstellt:
- `npm run qa:e2e:timeclock`
3. Aktueller Infrastruktur-Blocker:
- Flow-Einstieg auf variablen App-Zustand noch nicht stabil genug fuer vollautomatischen PASS.
- Manueller Produkt-Run ist PASS und gilt als Freigabe fuer Logik.

## Entscheidung
QA-Testmodul (`QA-Test: Feiertag/Vorfest Override`) bleibt temporaer aktiv, bis Brueckentage/Strategie-Logik integriert und verifiziert ist.

