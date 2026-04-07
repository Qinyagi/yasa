# YASA QA Run - Navigation Follow-up (2026-03-21)

## Meta
- Datum: 2026-03-21
- Tester: XyZ (guided by Codex)
- Build/Commit: lokal (working tree)
- Geraet: Android Device (ADB verbunden)

## Ergebnis
- Manuelle Navigation-Regression (reale aktuelle UI-Pfade): weitgehend PASS
- AI E2E Pilot (Maestro): PASS (3/3 im finalen Gesamtrun)

## Manuelle Checks
1. `Services -> Meine Shiftpals -> Zurueck`: PASS
2. `Services -> Meine Shiftpals -> Dienst tauschen`: PASS
3. `Mein Space -> Deine Spaces -> Weiteren Space erstellen -> Zurueck`: PASS
4. `Deine Spaces -> Admin -> (Biometrie) -> Admin Bereich -> QR -> Zu meinen Spaces`: PASS
5. `Deine Spaces -> Zurueck zum Start`: PASS
6. `Schichtmuster Setup -> Abbrechen`: PASS
7. `Urlaubs- & Freizeitkonto -> Zurueck`: PASS
8. `Services -> Reisen -> Reisen & Freizeit -> Angebotsdetail -> Go Back`: PASS
9. `Swap Kandidaten -> Android Hardware-Back`: PASS (`Services`, gleiches Ziel wie App-Back)

## E2E Pilot Status
- Fokustest `03_shiftpals_swap_opens.yaml`: PASS
  - Verifiziert: `Dienst tauschen -> Zurück -> Mit wem arbeite ich heute` (`today-title` sichtbar)
- Root Cause (zwischenzeitlicher FAIL):
  - Bottom-`Zurück`-Button wurde auf Android teils in die System-Navigationszone getappt (Home-Screen statt App-Rueckweg).
- Fix umgesetzt:
  - `swap-back-to-services` als echter Bottom-Button beibehalten, Position auf Android deutlich ueber der System-Navigation angehoben.
  - Safe-Area-/Bottom-Offset in `app/(swap)/index.tsx` angepasst.
- Finaler Gesamtrun `npm run qa:e2e:navigation`: PASS
  - `01_services_back_to_start`: PASS
  - `02_shiftpals_back_to_services`: PASS
  - `03_shiftpals_swap_opens`: PASS
  - Gesamt: `3/3 Flows Passed in 1m 12s`
