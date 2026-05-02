# Implementation Report: Rule Profile Member Sync Fix

**Datum:** 2026-04-15
**Status:** READY_FOR_READ_LATEST: YES
**Branch:** master
**Scope:** P0 – Member sieht "Kein Regelprofil" trotz vorhandenem Regelprofil

---

## Root Cause (technisch)

### Primary Bug: Member-Push überschreibt `rule_profile_json` mit NULL

**Datei:** `lib/backend/teamSync.ts:pushSpacesToBackend()` (Zeile 74-106 alt)

**Mechanismus:**
1. Host speichert Regelprofil -> `setSpaceRuleProfile()` -> Supabase `spaces.rule_profile_json` wird korrekt gesetzt
2. Member öffnet Zeitkonto -> `syncTeamSpaces()` wird aufgerufen
3. `pushSpacesToBackend()` schickt **alle** Spaces als Upsert, inklusive `rule_profile_json: null` (Member hat lokal kein Profil)
4. Supabase `INSERT ON CONFLICT DO UPDATE` setzt **alle** bereitgestellten Spalten -> `rule_profile_json` wird auf `null` überschrieben
5. Der anschließende `pullSpacesForProfile()` liest `null` zurück
6. **Ergebnis:** Member zerstört die Host-Daten und liest dann null -> "Kein Regelprofil"

### Secondary Bug: Stille Sync-Fehler -> irreführende UI

**Datei:** `app/(services)/time-account.tsx` (Zeile 83-93 alt)

- `syncTeamSpaces`-Fehler werden mit leerem `catch {}` verschluckt
- Kein UI-Feedback bei nicht-erreichbarem Backend
- User sieht "Kein Regelprofil" statt "Backend offline"

### Tertiary Bug: Kein lokales Caching des gesyncten Regelprofils

- Nach erfolgreichem Sync wird das via Space-Objekt erhaltene Regelprofil nie in die dedizierte `TIME_ACCOUNT_SPACE_RULES` Storage-Map persistiert
- Bei späteren Offline-Szenarien kann das Profil verloren gehen

---

## Dateien + Diff-Zusammenfassung

### 1. `lib/backend/teamSync.ts` — KRITISCHER FIX

**Vorher:** Ein einzelner `upsert()` mit `rule_profile_json: space.spaceRuleProfile ?? null` für alle Spaces -> Member überschreibt Host-Daten mit null.

**Nachher:**
- Haupt-Upsert **ohne** `rule_profile_json` (verhindert null-Overwrite)
- Separater `update()` nur für Spaces mit non-null `spaceRuleProfile`
- Member (die kein lokales Profil haben) senden nie `rule_profile_json` an Supabase
- Backward-compat: Fehler bei nicht-existierender Spalte wird weiterhin abgefangen
- [RULESYNC] Logging bei Pull- und Merge-Operationen

### 2. `app/(services)/time-account.tsx` — UI + Logging

- Neuer State `syncOffline` trackt ob Sync fehlgeschlagen ist
- Bei Sync-Fehler: `[RULESYNC]` logError mit Fehlergrund
- Bei Sync-Erfolg: `[RULESYNC]` logInfo mit pulled/pushed Counts
- UI differenziert:
  - Sync OK + Profil vorhanden -> Profil-Card anzeigen
  - Sync fehlgeschlagen + kein lokales Profil -> gelber Banner "Backend offline – letzter lokaler Stand"
  - Sync OK + kein Profil -> "Kein Regelprofil" (Owner muss es anlegen)
- Nach erfolgreichem Sync: `persistSyncedRuleProfile()` cacht Profil für Offline

### 3. `lib/storage.ts` — Caching + Logging

- `getSpaceRuleProfile()`: [RULESYNC] Logging für Quelle (dedicated map vs. Space-Objekt fallback), Error-Logging statt silent catch
- Neue Funktion `persistSyncedRuleProfile()`: Persistiert ein via TeamSync erhaltenes Regelprofil in die dedizierte Storage-Map für Offline-Resilienz

### 4. `lib/__tests__/ruleSyncMerge.test.ts` — NEU (5 Tests)

| Test | Invariante |
|------|-----------|
| R1 | Member erhält Profil bei erfolgreichem Remote-Pull |
| R2 | Backend offline -> lokales Profil bleibt erhalten |
| R2b | Remote gibt null zurück -> lokales Profil nicht downgegraded |
| R3 | Mehrere Spaces mit gleichem Namen -> korrekte ID-basierte Selektion |
| R4 | Remote-Update überschreibt ältere lokale Version |

---

## Testresultate

```
tsc --noEmit                          -> Exit 0 (clean)
npm test (175 existing tests)         -> ALL PASS
ruleSyncMerge.test.ts (5 new tests)   -> 5/5 PASS
```

---

## Manuelle Teststeps

### Device A (Host)

1. Admin -> Space-Regelprofil öffnen
2. Regelprofil ausfüllen und speichern
3. Bestätigung "Gespeichert" abwarten
4. In Supabase prüfen: `SELECT rule_profile_json FROM spaces WHERE id = '<spaceId>'` -> muss non-null sein

### Device B (Member)

5. Services -> Zeitkonto öffnen
6. **Erwartung (online):** Space-Regelprofil-Card wird angezeigt mit korrekten Daten
7. ADB Logs prüfen: `[RULESYNC] syncTeamSpaces OK`, `[RULESYNC] pulled space hasRuleProfile: true`
8. Flugmodus aktivieren -> Zeitkonto erneut öffnen
9. **Erwartung (offline):** Gelber Banner "Backend offline – letzter lokaler Stand wird angezeigt." + Profil-Card (aus Cache)
10. Falls noch nie gesynct im Offline-Modus: Banner zeigt "Kein Regelprofil lokal vorhanden. Bitte erneut öffnen, wenn eine Verbindung besteht."

### Regression Check

11. Device A: Regelprofil ändern (z.B. W-Regel togglen)
12. Device B: Zeitkonto erneut öffnen -> Änderung muss sichtbar sein
13. In Supabase prüfen: `rule_profile_json` darf nach Member-Sync NICHT null geworden sein

---

## Offene Risiken

| # | Risiko | Bewertung |
|---|--------|-----------|
| 1 | Supabase-Spalte `rule_profile_json` könnte bei neuen Spaces ohne Backfill noch null sein | LOW – Backfill wurde bereits ausgeführt, neue Spaces werden beim ersten Speichern befüllt |
| 2 | Race Condition: Host speichert gleichzeitig mit Member-Sync | MINIMAL – Member pusht jetzt nie `rule_profile_json` wenn null, und separater `update()` only wenn non-null |
| 3 | `persistSyncedRuleProfile` schreibt bei jedem Screen-Focus | LOW – Idempotent, nur AsyncStorage write |

---

## Kein SQL-Fix nötig

Die DB-Spalte `rule_profile_json` existiert bereits und der Backfill wurde ausgeführt. Das Problem war rein clientseitig (Member-Push überschreibt mit null).
