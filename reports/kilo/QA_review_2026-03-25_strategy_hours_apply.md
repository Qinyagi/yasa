# QA-Gate-Review: Strategy Hours Apply (2026-03-25)
**Datum:** 2026-03-25
**Reviewer:** Codex QA Gate
**Scope:** Roadmap Block A/B – Strategietyp `Stunden` inkl. Apply-Pfad
**Betroffene Dateien:**
- `yasa/lib/storage.ts`
- `yasa/app/(shift)/strategy.tsx`

---

## 1) Findings

Keine blockierenden Findings.

### [INFO] Stunden-Apply schreibt bewusst nur Overrides (`X`), keine Stundenkonto-Buchung
- **Datei + Zeile:** `yasa/lib/storage.ts:926-931`
- **Impact:** Aktuell wird `Stunden einsetzen` als freie Tage via Override modelliert. Eine explizite Abbuchung in einem dedizierten Stundenbank-Modell existiert noch nicht.
- **Bewertung:** Für Roadmap v1 akzeptabel, da als MVP ohne komplexe Tarif-/Buchungslogik geplant.

---

## 2) Verifizierte Stärken

1. `VacationStrategy` unterstützt jetzt Typen (`vacation`/`hours`) inkl. `requiredHours`.
2. `calculateVacationStrategy` erzeugt zusätzlich Stunden-Strategien (`hourStrategies`).
3. `applyVacationStrategy` unterstützt `hours`-Strategien produktiv (Setzen von `X`-Overrides).
4. Strategy-UI zeigt Typ-Badges, benötigte Stunden, Antragshinweis und getrennte Apply-Texte.
5. Applied-State ist für Stundenstrategien korrekt an Overrides (`X`) gekoppelt.

---

## 3) Test-/Check-Protokoll

| Check | Command | Ergebnis | Notiz |
|---|---|---|---|
| TypeScript | `cd yasa && npm run typecheck` | PASS | `tsc --noEmit` grün |
| Tests | `cd yasa && npm test` | PASS (47/47) | `shiftEngine` + `timeclock` grün |
| Statischer Review | `Select-String` auf geänderten Dateien | PASS | Kernpfade vorhanden/verknüpft |

---

## 4) QA-Entscheidung (Gate)

**PASS WITH RISKS**

Der neue Strategietyp `Stunden` ist funktional integriert und im UI/Apply-Pfad konsistent umgesetzt. Typecheck und Tests sind grün. Es gibt keine regressionskritischen Findings im implementierten Scope. Restrisiko bleibt, dass `Stunden einsetzen` aktuell als Override-Mapping (`X`) umgesetzt ist und noch keine explizite Stundenbank-Abbuchung modelliert. Für den aktuellen Roadmap-Schritt ist das akzeptabel.

---

## 5) Next Actions

1. Stundenbank-Modell spezifizieren (falls `requiredHours` künftig tatsächlich verbucht werden soll).
2. Optional: dedizierte Tests für `calculateVacationStrategy` mit `hours`-Pfad ergänzen.
