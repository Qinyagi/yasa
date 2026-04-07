# YASA Routing Architecture Plan

## Kontext
Navigation wurde bereits in mehreren Screens mit `canGoBack()` + Fallback stabilisiert.
Der naechste Schritt ist ein konsistentes Routing-Modell fuer die gesamte App (nicht nur punktuelle Fixes).

## UX-Ziele
1. Kein Deadend in keinem Screen.
2. Back-Verhalten ist fuer User vorhersagbar:
- Mit History: echter Ruecksprung.
- Ohne History (Deep Link/Kaltstart): definierter Home/Funktions-Fallback.
3. Guards (Profil, Space, Membership) fuehren immer in nutzbare Recovery-Routen.
4. Keine ungueltigen oder relativen Route-Strings.

## Routing-Regeln (Contract)
1. Rule A: Rueckaktionen laufen ueber `handleBack()` je Screen.
2. Rule B: `if (navigation.canGoBack()) router.back(); else router.replace(<fallback>)`.
3. Rule C: Fallback ist pro Feature stabil:
- Services-nahe Screens -> `/(services)`
- Space-Flows -> `/(space)/choose`
- Affiliate-Detail -> `/(affiliate)`
- Admin-Subpages -> `/(admin)`
4. Rule D: Absolute Pfade verwenden (`/...`), keine implizit relativen Strings.
5. Rule E: Guard-Screens bieten immer mindestens einen expliziten Recovery-CTA.

## Aktueller Audit-Stand (2026-03-15)
- Bestehende Back-Fallbacks in 9 Screens sind konsistent umgesetzt.
- Gefundener Bug wurde gefixt:
  - `app/(affiliate)/questionnaire.tsx` nutzte vorher `router.replace('(affiliate)?...')`
  - jetzt: `router.replace('/(affiliate)?...')`

## Priorisierte Arbeitsphasen

### Phase 1 - Contract Enforcement (schnell, risikoarm)
1. Alle verbleibenden direkten `router.back()`-Nutzungen ohne Guard identifizieren.
2. In `handleBack()` + Fallback ueberfuehren.
3. Regression-Checklist + Test-Run-Template konsequent nutzen.

### Phase 2 - Flow-Konsistenz (mittel)
1. Pro Feature einen "Rueck-Anker" festlegen:
- Auth, Space, Services, Shift, Swap, Affiliate, Admin, Team.
2. Push vs Replace je Einstiegspunkt harmonisieren (insb. Deep-Link-Einstiege).
3. Einheitliche Query-Param-Namen fuer Return-Kontext (`returnTo`, `from`, `token`).

### Phase 3 - UX-Polish & Observability
1. Optionales Navigation-Debug-Logging im Dev-Modus.
2. E2E-Szenarien fuer Hardware-Back und Kaltstart-Flows erweitern.
3. Release-Gate: "No deadend" als harte QA-Bedingung.

## Definition of Done (Routing)
- Keine reproduzierbaren Deadends in Basis + E2E-Fokus-Checks.
- Alle kritischen Rueckaktionen folgen Rule B.
- Typecheck/Test gruen.
- QA-Report PASS.

