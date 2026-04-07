# YASA Next Session Roadmap (2026-03-24)

## 1) Session-Start (10-15 min)
- Smoke-Check: Startscreen, Services, Stempeluhr, Strategie.
- Verifizieren: KS/KN-Antrags-Reminder inkl. 7-Tage-Eskalation.

## 2) Feature-Block A (Hauptziel): KS/KN Stundenstrategie
- Strategiemodus `Stunden einsetzen` ergänzen (zusätzlich zu Urlaubstagen).
- Vorschläge ausgeben mit:
  - benötigte Stunden
  - freie Tage gesamt
  - Typ (`Urlaub` oder `Stunden`)
- Erste Version bewusst ohne komplexe Tarif-Sonderlogik, aber erweiterbar.

## 3) Feature-Block B: Strategie UI/UX Feinschliff
- In der Strategieliste klar markieren:
  - Vorschlagstyp (Urlaub/Stunden)
  - Antrag erforderlich bei KS/KN
  - relevante Hinweise kompakt im Card-Text

## 4) Stabilitäts-Block: Scale-Readiness v1
- Datenwachstum prüfen:
  - Timeclock Events
  - Reminder
  - Day Changes
- Performance prüfen:
  - Listen-Rendering
  - Berechnungswege im Strategie-/Zeitkonto-Bereich
- Datenintegrität prüfen:
  - Overrides
  - Urlaub + Strategy Apply
  - Reminder-Lebenszyklus
- Ergebnis: priorisierte Top-5 Hardening-Liste.

## 5) QA + Doku Abschluss
- 3-5 definierte End-to-End Tests der Reihe nach ausführen.
- Ergebnisse in QA/Status-MDs dokumentieren.
- Abschlussstatus setzen:
  - PASS
  - offene Punkte
  - nächste Aktionen
