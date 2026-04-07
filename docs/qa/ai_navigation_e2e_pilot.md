# AI Navigation E2E Pilot (Maestro)

## Ziel
Navigation-Regressionen automatisiert ausfuehren, waehrend Human-Checks als Qualitaetsanker bestehen bleiben.

## Scope (Pilot)
Automatisierte Flows:
1. `Start -> Services -> Zurueck zum Start`
2. `Start -> Services -> Meine Shiftpals -> Zurueck`
3. `Start -> Services -> Meine Shiftpals -> Dienst tauschen`

Flows liegen unter:
- `.maestro/navigation/01_services_back_to_start.yaml`
- `.maestro/navigation/02_shiftpals_back_to_services.yaml`
- `.maestro/navigation/03_shiftpals_swap_opens.yaml`

## Voraussetzungen
1. Maestro CLI installiert.
2. Portable Java liegt unter `.tools/jre17` (im Repo vorbereitet).
3. App auf Device/Emulator laufend.
4. Device muss fuer Maestro sichtbar sein (`maestro devices`).
5. `APP_ID` gesetzt:
- Expo Go: `host.exp.exponent`
- Dev Build: euer eigenes App-ID Bundle
6. Testkonto mit aktivem Space + Membership (fuer Shiftpals/Swap).

Hinweis:
- Falls `maestro` nicht im PATH liegt, ist auf Windows typischerweise `C:\Users\<user>\.maestro\bin\maestro.bat` relevant.

## Ausfuehrung
Im Projektordner `c:\Users\XyZ\Documents\YASA\yasa`:

```powershell
npm run qa:e2e:navigation
```

Optional eigenes APP_ID:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/qa/run_maestro_navigation.ps1 -AppId "host.exp.exponent"
```

## Interpretationsregel (Hybrid QA)
1. KI-E2E `PASS` + Human-Stichprobe `PASS` -> Flow gilt als stabil.
2. KI-E2E `PASS` + Human `FAIL` -> Test-Luecke schliessen, Flow erweitern.
3. KI-E2E `FAIL` -> Defect oder Flaky Test triagieren.

## Nächster Ausbau
1. Deep-Link-Fallback-Flows (`/(admin)`, `/(admin)/space-rules?...`) als eigene Maestro-Flows.
2. Nightly/PR-Automation im CI.
3. Reduktion Human-Tests auf Stichproben je Release-Kandidat.
