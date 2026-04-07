# YASA QA Run - Navigation (2026-03-17)

## Meta
- Datum: 2026-03-17
- Tester: XyZ
- Build/Commit: lokal (working tree)
- Geraet/OS:
- App-Version:

## Ergebnis-Skala
- PASS: Verhalten wie erwartet, kein Deadend
- FAIL: Deadend, falsches Ziel oder keine Ruecknavigation
- N/A: Nicht anwendbar im aktuellen Run

## Basis-Checks

1. `Services -> Meine Shiftpals -> Zurueck`  
Status: [x] PASS [ ] FAIL [ ] N/A  
Notiz: Zurueck-Button fuehrt wie erwartet zur Services-Page.

2. `Admin -> Zurueck`  
Status: [x] PASS [ ] FAIL [ ] N/A  
Notiz: Fallback-Pfad getestet per Deep-Link `/(admin)` ohne History -> Zurueck fuehrt korrekt nach `/(services)`.

3. `Admin -> Space-Regelprofil -> Zurueck`  
Status: [x] PASS [ ] FAIL [ ] N/A  
Notiz: Guard-Fall getestet (Deep-Link ohne gueltige `spaceId` -> "Space nicht gefunden"). Klick auf `Zurueck` fuehrt nach Biometrie-Scan korrekt zur Admin-Page.

## E2E Fokus

1. `Kaltstart ohne History -> Back-Fallback`  
Status: [ ] PASS [ ] FAIL [ ] N/A  
Notiz:

## Defects
- ID: NAV-2026-03-17-01
- Schritt/Repro: In `/(team)/today` auf Button `Dienst tauschen` tippen.
- Erwartet: Navigation zur Schichttausch-Seite `/(swap)`.
- Ist: Deadend (unmatched route) bei Ziel `/(swap)/index`.
- Severity: High
- Fix: Route in `app/(team)/today.tsx` auf `router.push('/(swap)')` korrigiert.

- ID: NAV-2026-03-17-02
- Schritt/Repro: Auf `/(services)` den Zurueck-Button druecken.
- Erwartet: Startseite `/`.
- Ist: Initial Ruecksprung blieb auf Services.
- Severity: High
- Fix: Eindeutige Start-Route `app/start.tsx` eingefuehrt und Ruecknavigation in `app/(services)/index.tsx` auf `router.replace('/start')` umgestellt.
- Verifikation: PASS (Zurueck-Button auf Services fuehrt jetzt erwartungsgemaess zur Startseite).

- ID: PERF-2026-03-17-01
- Schritt/Repro: `Services -> Mein Kalender` oeffnen.
- Erwartet: < 1s bis nutzbarer Screen.
- Ist: Initial berichtete Ladezeit 3-4s.
- Severity: High
- Fix: `app/(shift)/calendar.tsx` auf staged loading + deferred heavy work umgebaut.
- Verifikation: PASS (Low-end Testgeraet ~1s, High-Performance Geraet <0.5s).
