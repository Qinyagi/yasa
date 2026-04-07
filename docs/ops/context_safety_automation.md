# YASA Context Safety Automation

## Ziel
Kontextverlust nach VS Code/Agent-Neustarts verhindern, ohne jedes Mal manuell "save status" ausloesen zu muessen.

## Bestandteile
- `scripts/ops/save_session_checkpoint.ps1`
  - schreibt:
    - `docs/ops/session_latest.md`
    - `docs/ops/session_archive/session_YYYYMMDD_HHMMSS.md`
  - beinhaltet Branch, Git-Status, letzte Commits, modified/untracked Dateien.
- `scripts/ops/resume_session.ps1`
  - zeigt den letzten Snapshot + aktuellen Git-Zustand.
- `scripts/ops/install_session_automation.ps1`
  - richtet Windows Scheduled Task ein:
    - bei Login
    - alle 15 Minuten

## Einmalige Einrichtung
Im YASA-Repo:

```powershell
npm run ops:install-autocheckpoint
```

## Manuell (optional)
```powershell
npm run ops:checkpoint
npm run ops:resume
```

## Betriebsregel
- Wir verlassen uns nicht mehr auf Chat-Kontext als SSOT.
- SSOT fuer Session-Status ist `docs/ops/session_latest.md`.
- Historie liegt in `docs/ops/session_archive/`.
