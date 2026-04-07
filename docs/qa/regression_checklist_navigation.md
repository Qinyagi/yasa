# YASA Regression Checklist - Navigation & Return

## Ziel
Schnelle Regression nach Navigation-/Back-Fixes, damit keine Deadends mehr auftreten.

## Vorbedingungen
- Profil existiert
- Optional: Space vorhanden
- App startet ohne Crash

## Checkliste

1. `Services -> Meine Shiftpals -> Zurueck`
- Erwartung: Rueckkehr nach `/(services)` ohne Sackgasse.

2. `Admin -> Zurueck` (normaler Pfad)
- Erwartung: Rueckkehr zur vorherigen Seite; falls kein Stack: Fallback nach `/(services)`.

3. `Admin -> Space-Regelprofil -> Zurueck`
- Erwartung: Rueckkehr nach `/(admin)` auch ohne History.

4. `Mein Space -> Deine Spaces -> Weiteren Space erstellen -> Zurueck`
- Erwartung: Rueckkehr nach `Deine Spaces`; kein leerer Screen.

5. `Deine Spaces -> Admin -> (Biometrie) -> Admin Bereich -> QR -> Zu meinen Spaces`
- Erwartung: Rueckkehr nach `Deine Spaces`; kein leerer Screen.

6. `Deine Spaces -> Zurueck zum Start`
- Erwartung: Rueckkehr zur Startseite ohne Sackgasse.

7. `Schichtmuster Setup -> Abbrechen`
- Erwartung: Rueckkehr zu `/(services)` bei fehlender History.

8. `Urlaubs- & Freizeitkonto -> Zurueck`
- Erwartung: Rueckkehr zu `/(services)` bei fehlender History.

9. `Services -> Reisen -> Reisen & Freizeit -> Angebotsdetail -> Go Back`
- Erwartung: Rueckkehr nach `Reisen & Freizeit`; kein Deadend.

10. `Swap Kandidaten Hardware-Back`
- Erwartung: gleiches Ziel wie der Button `Zurueck`, inkl. Return-Point-Logik.

## E2E Fokus (2026-03-15)

1. `Kaltstart in Detailscreen ohne History -> Back-Fallback`
- Setup: App frisch starten, direkt in einen Detailscreen deep-linken (z. B. `/(affiliate)/offer/[id]` oder `/(admin)/space-rules`).
- Aktion: `Zurueck` tippen.
- Erwartung: Kein Deadend, sondern Route-Fallback per `router.replace(...)` auf die definierte Zielseite.

2. `Normaler Push-Flow mit History -> echtes Back`
- Setup: Von Uebersicht in den jeweiligen Screen navigieren (History vorhanden).
- Aktion: `Zurueck` tippen.
- Erwartung: `navigation.canGoBack()` greift, Ruecksprung zur vorherigen Seite (nicht zum Fallback).

3. `Space-Flows Abbruchpfade (create/join/manage)`
- Setup: Nacheinander `/(space)/create`, `/(space)/join`, `/(space)/manage` oeffnen.
- Aktion: jeweils `Zurueck`/`Abbrechen` betaetigen, inkl. Alert-Pfad in `join`.
- Erwartung: Immer sichere Rueckkehr nach `/(space)/choose`; kein leerer Screen, kein stuck state.

## Gate
- PASS: Alle 10 Basis-Checks + 3 E2E-Fokus-Checks ohne Deadend.
- FAIL: Eine Navigation landet auf leerer/unmatched Route oder bleibt ohne Rueckweg.

## Test-Run Vorlage
- Siehe: `docs/qa/regression_run_template_navigation.md`

## AI E2E Pilot
- Siehe: `docs/qa/ai_navigation_e2e_pilot.md`

## Aktuelle UI-Hinweise (Stand: 2026-03-21)
- Der Einstieg in Space-Flows laeuft ueber `Mein Space`.
- Die Verwaltungsseite heisst `Deine Spaces`.
- Der QR-Pfad ist aktuell unter `Admin Bereich` mit Button `QR`.
- Im QR-Screen ist der Rueckweg-Button `Zu meinen Spaces` (nicht `Abbrechen`).
