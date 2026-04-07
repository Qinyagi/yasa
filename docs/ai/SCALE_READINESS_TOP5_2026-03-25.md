# YASA Scale-Readiness v1 Top-5 (2026-03-25)

## Ziel
Priorisierte Hardening-Liste fuer Datenwachstum, Performance und Datenintegritaet als naechster Engineering-Block nach dem Strategy-Update.

## Top-5 Priorisierung

### 1) P0 - AsyncStorage Write-Serialization fuer kritische Maps
- **Bereich:** `lib/storage.ts` (`TIMECLOCK_EVENTS`, `SHIFT_OVERRIDES`, `DAY_CHANGES`, `VACATION_SHORTSHIFT_REMINDERS`)
- **Risiko:** Read-modify-write kann bei konkurrierenden Writes Daten verlieren.
- **Massnahme:** Einheitliches Write-Gate (per Key Queue/Mutex) fuer kritische Storage-Pfade.
- **Definition of Done:**
  - keine direkten Raw-SetItem Writes mehr in kritischen Pfaden ohne Gate
  - Regressionstest fuer doppelte schnelle Writes vorhanden
- **Status (2026-03-25):** DONE

### 2) P1 - Strategie-Engine aus `storage.ts` extrahieren
- **Bereich:** `calculateVacationStrategy`/`applyVacationStrategy`
- **Risiko:** `storage.ts` ist mit ~2010 Zeilen zu gross; fachliche Logik und Persistenz sind zu stark gekoppelt.
- **Massnahme:** Strategieberechnung nach `lib/strategyEngine.ts` auslagern, Storage nur fuer I/O.
- **Definition of Done:**
  - Engine als pure Funktionen testbar
  - `storage.ts` dient nur als Adapter fuer Laden/Speichern
- **Status (2026-03-25):** DONE

### 3) P1 - Strategy/Timeclock Tests erweitern
- **Bereich:** `lib/__tests__/timeclock.test.ts` + neue Strategy-Tests
- **Risiko:** Neue `hours`-Strategien sind funktional integriert, aber noch nicht durch eigene Strategie-Tests abgesichert.
- **Massnahme:** Unit-Tests fuer:
  - `strategyType`-Erzeugung (`vacation` + `hours`)
  - `requiredHours` Berechnung fuer KS/KN
  - Apply-Pfad `hours` -> Override `X`
- **Definition of Done:**
  - dedizierte Testdatei fuer Strategie vorhanden
  - Kernfaelle + Edge-Cases gruen
- **Status (2026-03-25):** DONE

### 4) P2 - Datenwachstum begrenzen (Retention/Compaction)
- **Bereich:** `TIMECLOCK_EVENTS`, `DAY_CHANGES`, Reminder-Historien
- **Risiko:** Langfristig steigende JSON-Maps verschlechtern Ladezeit und Memory.
- **Massnahme:** Aufbewahrungsstrategie einfuehren:
  - Events aggregiert nach Monat (historische Rohdaten optional archivieren)
  - bereinigte Historien fuer erledigte Reminder/obsolete Day Changes
- **Definition of Done:**
  - dokumentierte Retention-Regeln
  - Migrations-/Cleanup-Job fuer Altbestand
- **Status (2026-03-25):** IN PROGRESS
  - DONE: Retention fuer bestaetigte ShortShift-Reminder
  - DONE: Compaction redundanter `DAY_CHANGES`
  - DONE: Dedupe fuer exakte `TIMECLOCK_EVENTS`-Duplikate
  - OFFEN: optionales Monats-Archiv/weitere Aggregation fuer Langzeitdaten

### 5) P2 - Strategie-Apply fachlich finalisieren (Stundenbank-Modell)
- **Bereich:** `applyVacationStrategy` fuer `strategyType = 'hours'`
- **Risiko:** Aktuell wird `hours` als Override-Apply (`X`) modelliert; echte Stundenbank-Abbuchung fehlt.
- **Massnahme:** klares Stundenbank-Domainmodell definieren (SSOT + Buchungsregeln) und Apply daran anbinden.
- **Definition of Done:**
  - `requiredHours` wird gegen verfuegbares Stundenkonto geprueft
  - Abbuchung/Journal nachvollziehbar gespeichert
  - UI zeigt Kontostand vor/nach Apply
- **Status (2026-03-25):** OPEN

## Reihenfolge fuer Umsetzung
1. P2 Retention/Compaction finalisieren
2. P2 Stundenbank-Modell
