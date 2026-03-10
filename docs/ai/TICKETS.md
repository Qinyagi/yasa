# YASA – Ticket Tracker

## Status-Legende
- READY: Naechstes Ticket, bereit zur Implementierung
- BACKLOG: Geplant, aber nicht als naechstes dran
- DONE: Abgeschlossen
- BLOCKED: Wartet auf Abhaengigkeit

---

## READY

### TICKET-20: Layout-Level Navigation Guards
**Prioritaet**: MEDIUM
**Scope**: _layout.tsx Dateien sollen Profil/Space-Existenz pruefen bevor Screens rendern.

---

## BACKLOG

### TICKET-21: Biometric Timeout/Re-Auth
**Prioritaet**: LOW
**Scope**: Admin-Bereich Re-Auth nach 5min Inaktivitaet.

### TICKET-22: Storage Error Recovery
**Prioritaet**: LOW
**Scope**: JSON.parse Fehler loggen + User-Feedback statt stille Defaults.

### TICKET-23: Warning-Farben in Theme zentralisieren
**Prioritaet**: LOW
**Scope**: Hardcoded #FEF3C7/#FCD34D/#F59E0B/#92400E in colors-Objekt aufnehmen.

---

## DONE

### Sprint A1: Stabilisierung (A1-02 bis A1-05)
- A1-02: Membership Guards auf candidates.tsx (Profil/Space getrennt) + admin/index.tsx (Profil-Guard)
- A1-03: Storage Write Patterns auditiert – keine Aenderungen noetig (bereits sauber)
- A1-04: Ghost Cleanup bei deleteSpace – archiviert Ghosts automatisch
- A1-05: lib/log.ts + 7 Logging-Punkte (createProfile, createSpace, joinSpace, deleteSpace, createSwapRequest, acceptSwapRequest, loadCurrentContext)

### TICKET-19: Ghost Cleanup bei Space-Loeschung → DONE via A1-04

### TICKET-18: Swap-Badge Notifications (IT 18)
- Startscreen: Swap-Banner mit Count + Navigation zu Swap-Screen
- Services Hub: Gelber Badge-Counter auf "Schichttausch" Kachel

### IT17-001 + IT17-002: Blocker-Fixes (Hotfix 17.2)
- isStrategyApplied: .some() -> .every() (strategy.tsx)
- acceptSwapRequest: Write-Order umgekehrt (Status zuerst, Shifts danach)

### TICKET-17: Refactor – Deduplizierung + TypeScript (IT 17 + 17.1)
- 12 Dateien, 0 any-Leaks, SSOT Constants, tsc clean

### Vollstaendige Historie: Iterationen 1-16
- IT1: Expo Router Setup
- IT2: Profil + Space CRUD
- IT3: SVG Avatar + QR
- IT4: Space beitreten per QR-Scan
- IT5: CoAdmin + Space-Verwaltung
- IT6: Shiftplan MVP (Setup + Calendar + Today)
- IT7: Swap Candidates MVP
- IT7b: Erweiterte Schichtlogik (8 Codes, Zyklus)
- IT8: Ghost User MVP + Avatar Fix
- IT8.5: Swipeable Monatskalender
- IT9: Vacation Planning + Strategy
- IT10: Swap Request System + Hotfixes
- IT14: Services Hub + Admin Safetylock + Calendar Modal
- IT16: Startscreen v2
