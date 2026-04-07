# YASA Backend Bootstrap (Phase 1)

## Ziel
Echte zentrale Datenbasis fuer 2 Geraete (Profiles, Spaces, Memberships, Swaps) via Supabase.

## Aktueller Stand
- Supabase SDK eingebunden (`@supabase/supabase-js`)
- App-Konfig vorbereitet (`expo.extra.supabase.url`, `expo.extra.supabase.anonKey`)
- Basis-Client + anonyme Session in `lib/backend/*`
- SQL-Schema fuer Phase 1 liegt vor:
  - `docs/backend/supabase_phase1_schema.sql`

## Schritt 1: Supabase Projekt
1. Neues Supabase Projekt anlegen.
2. In `Authentication > Providers` den Provider `Anonymous` aktivieren.
3. In `Project Settings > API`:
   - Project URL kopieren
   - `anon` key kopieren

## Schritt 2: YASA App-Konfiguration
`app.json`:
```json
"extra": {
  "supabase": {
    "url": "https://<project>.supabase.co",
    "anonKey": "<anon-key>"
  }
}
```

## Schritt 3: Schema deployen
Im Supabase SQL Editor den Inhalt von `docs/backend/supabase_phase1_schema.sql` ausfuehren.

## Schritt 4: Verbindungscheck
Nach App-Reload kann `checkBackendHealth()` aus `lib/backend/health.ts` aufgerufen werden.

## Nächste Implementierung (Phase 1a)
1. `profiles` remote lesen/schreiben (statt lokal-only).
2. `spaces` + `space_members` remote anbinden.
3. `swaps` remote anbinden.
4. Danach 2-Geraete-Test in echter Umgebung:
   - Geraet A erstellt Space
   - Geraet B joint per Token/QR
   - Aenderung auf A ist auf B sichtbar

