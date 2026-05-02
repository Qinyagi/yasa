# YASA – Current State

## Aktueller Entwicklungsstand: Performance Pass 1 nach Prepared Shiftpals
**Datum**: 2026-05-03
**Status**: Prepared ID Profiles Physical QA PASS; Performance Pass 1 technisch gegatet und auf beide Geräte installiert
**Primäre Resume-Quelle**: `C:\Users\XyZ\Documents\YASA\YASA-Obsidian-Brain\00_RESUME_HERE.md`
**Nächster Plan**: `C:\Users\XyZ\Documents\YASA\YASA-Obsidian-Brain\wiki\space-isolation-next-session-2026-05-01.md`
**Aktueller Handoff**: `C:\Users\XyZ\Documents\YASA\YASA-Obsidian-Brain\handoffs\2026-05-02 Space Cleanup Night Checkpoint For Codex.md`

## Performance Pass 1 2026-05-03: Focus-Sync Entlastung

Anlass:

- Nach Prepared Profiles, Space-Regeln und defensiven Supabase Pulls waren Seitenwechsel merklich langsamer.
- Ursache war sehr wahrscheinlich kein einzelner UI-Bug, sondern mehrfacher `syncTeamSpaces()`-Aufruf beim Fokussieren vieler Pages.
- `syncTeamSpaces()` führt bewusst Push/Pull-Routinen aus und lädt inzwischen zusätzlich Rule Profiles und Prepared Profile Roster.

Implementiert:

- `syncTeamSpaces()` unterstützt optionales Kurzzeit-Caching über `{ allowCached: true, ttlMs? }`.
- Standard bleibt unverändert: ohne Option läuft der Sync vollständig.
- Realtime-, Aktions- und Management-Syncs bleiben uncached.
- Read-only bzw. Focus-Syncs wurden entlastet auf:
  - `app/(team)/today.tsx`
  - `app/(shift)/day-detail.tsx`
  - `app/(services)/info-service.tsx`
  - `app/(services)/space-members.tsx`
  - `app/(services)/time-account.tsx`
  - `app/(admin)/index.tsx`
  - `app/(space)/choose.tsx`
- Host-Push der Prepared ID Profiles wird über eine Roster-Signatur dedupliziert, damit unveränderte 16er-Roster nicht bei jedem Focus erneut in Supabase geschrieben werden.

Bewusste Grenze:

- Keine Änderung an Prepared-Profile-Matching, Member-Profilen, Rollen, Co-Admin, Space-Regeln, Space-Delete, QR-Transfer, ShiftPlan-Matching oder Kalenderlogik.
- Prepared Profiles bleiben getrennt von `memberProfiles`.
- Feature-, Function- und Routine-Verhalten soll erhalten bleiben; dieser Pass reduziert nur redundante Sync-Arbeit.

Validierung:

- `npm run typecheck`: PASS
- `npx sucrase-node lib/__tests__/memberSync.test.ts`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS auf Device A `KNMVMVGY89NFHAQ4` und Device B `R5CX15JX98E`

Physical QA empfohlen:

- Pages öffnen/wechseln und prüfen, ob Ladegefühl besser ist.
- `Meine Shiftpals`, `Shiftpals Tagesdetails`, `Infoservice`, `Space-Mitglieder`, `Zeitkonto`, `Admin` und `Deine Spaces` kurz gegenprüfen.

## Checkpoint 2026-05-02: Space Gate Lock + Prepared Profiles In Shiftpals

Space Cleanup / Space Isolation finaler technischer Gate:

- `npm run typecheck`: PASS
- `npx sucrase-node lib/__tests__/timeclock.test.ts`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS auf Device A `KNMVMVGY89NFHAQ4` und Device B `R5CX15JX98E`

Entscheidung:

- Space Cleanup ist technisch gegated und für normale/disposable Space-Flows gelockt.
- Physisch bestätigt bleiben A/B/C Vault-Isolation, bidirektionaler Cross-Device Vault Sync und disposable Space Delete nach Tombstone-Fix.
- Die einzige ungetestete destruktive Grenze bleibt das Löschen des ursprünglichen ersten Space; nicht casual testen.

Prepared ID Profiles in Shiftpals implementiert:

- `app/(team)/today.tsx` lädt Prepared ID Profiles aus dem aktiven Space.
- Prepared Profiles mit zugewiesenem Dienstplanmuster werden für den betrachteten Today-Tag über `anchorDateISO + pattern` abgeleitet.
- Nur Prepared Profiles mit derselben Schicht wie der aktuelle User erscheinen in `Meine Shiftpals` / `Heute im Team`.
- Bereits `transferred` markierte Prepared Profiles werden ausgeblendet, um Doppelanzeige nach QR-Übernahme zu vermeiden.
- Prepared Entries bleiben reine Anzeigeeinträge und werden nicht in `memberProfiles`, Rollen, Co-Admin- oder Permission-Logik aufgenommen.
- UI-Marker: `Vorbereitet`.

Neue Regression:

- `lib/preparedProfilesShiftpals.ts`
- `lib/__tests__/preparedProfilesShiftpals.test.ts`
- `npm test` enthält den neuen Testlauf.

Validierung nach Prepared-Profiles-Slice:

- `npx sucrase-node lib/__tests__/preparedProfilesShiftpals.test.ts`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS auf beiden Geräten

Nächster sinnvoller Schritt:

1. Physical QA: Host erstellt vorbereitetes ID-Profil mit Schichtmuster, gleiche-Schicht-Anzeige in `Heute im Team` prüfen.
2. Gegenprobe mit anderer Schicht/anderem Tag prüfen: Prepared Profile darf nicht erscheinen.
3. Transfer auf Zweitgerät prüfen: nach Übernahme keine Doppelanzeige als Prepared + aktives Member.

## Korrektur 2026-05-03: Prepared Profiles als Space-weiter Shiftpal-Roster

Produktverständnis:

- Prepared ID Profiles sind ein Onboarding-Service des Space-Hosts.
- Der Host bereitet reale zukünftige Team-Member mit obfuskiertem Profil, Avatar und nacktem verankertem Grunddienstplan vor.
- Nach QR-Übernahme gehört das Profil dem realen Member; das Member ergänzt danach persönliche Dienstplan-Feinheiten, Abweichungen, Zeit-/Guthabeninformationen und weitere Systemangaben.
- Vor der Übernahme sind Prepared Profiles keine echten Mitglieder und dürfen keine Rechte, Rollen, Co-Admin-State, Membership-History oder authority-bearing Actions bekommen.
- Trotzdem sollen sie allen Space-Members als read-only Shiftpal-Roster helfen, solange noch nicht alle die App eingerichtet haben.

Implementiert:

- `PreparedIdProfile` ist optional am `Space`-Modell als `preparedIdProfiles` lesbar, bleibt aber getrennt von `memberProfiles`.
- Team-Sync unterstützt `spaces.prepared_id_profiles_json`.
- Nur der Space-Owner/Host pusht Prepared Profiles in diese JSON-Spalte.
- Nicht-Owner pullen den Prepared-Roster read-only und spiegeln ihn lokal in `yasa.preparedIdProfiles.v1`.
- `ID-Profile vorbereiten` pusht Host-Änderungen best-effort sofort nach Anlegen, Bearbeiten, Löschen oder Markieren als übertragen.
- `Meine Shiftpals` / `Heute im Team` nutzt den Prepared-Roster für gleiche-Schicht-Matching.
- `Shiftpals Tagesdetails` nutzt denselben Matching-Helper für das gewählte Datum.
- Prepared Entries werden mit `Vorbereitet` markiert.
- Prepared Entries werden ausgeblendet, wenn `status === transferred` ist oder dieselbe `profileId` bereits als echtes aktives Member im Space existiert.

Neue/angepasste Dateien:

- `docs/backend/supabase_add_prepared_id_profiles.sql`
- `types/index.ts`
- `lib/backend/teamSync.ts`
- `lib/storage.ts`
- `lib/preparedProfilesShiftpals.ts`
- `app/(space)/profile-transfer.tsx`
- `app/(team)/today.tsx`
- `app/(shift)/day-detail.tsx`
- `lib/__tests__/preparedProfilesShiftpals.test.ts`

Validierung:

- `npm run typecheck`: PASS
- `npx sucrase-node lib/__tests__/preparedProfilesShiftpals.test.ts`: PASS
- `npx sucrase-node lib/__tests__/memberSync.test.ts`: PASS
- `npm test`: PASS

Physical QA 2026-05-03:

- Supabase-Migration `docs/backend/supabase_add_prepared_id_profiles.sql` angewendet: SUCCESS.
- Release Build und Install auf Ultra24 und Poco: PASS.
- Ultra24/Host hat den bestehenden Roster mit 16 Prepared Profiles über `ID-Profile vorbereiten` gepusht.
- Poco/Member sieht passende vorbereitete Kolleginnen in `Meine Shiftpals` / `Heute im Team`.
- Kalender `Shiftpals Tagesdetails` zeigt passende vorbereitete Kolleginnen für den gewählten Tag.
- Ergebnis: FULL SUCCESS / PASS.

Noch offen:

- Post-transfer no-duplicate Verhalten beim nächsten tatsächlichen Profiltransfer nochmals prüfen.
- Supabase CLI lokal installiert unter `C:\Users\XyZ\Documents\YASA\tools\supabase\supabase.exe`.
- Version: `2.95.4`.
- Hinweis: `supabase --version` zeigt aktuell zusätzlich eine Docker-Config-Warnung wegen Zugriff auf `C:\Users\XyZ\.docker\config.json`; CLI läuft trotzdem.

## Session Lock 2026-04-30

Locked for today:

- strict Space-scoped ShiftPlan reads via `spaceId::profileId`
- original/oldest Workspace legacy-data migration
- later-created Spaces remain fresh and do not receive legacy operational data
- Space Lobby rule: `Mein Space` / `Deine Spaces` is safe browsing, not a casual write-context switch
- Admin activation is the protected write-context switch
- Admin activation is available to every member for their own device context
- authority-bearing actions remain role-bound
- Admin-Bereich spacing pass applied from Design SSOT as style-only change

Technical validation:

- `npx sucrase-node lib/__tests__/timeclock.test.ts`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS on both devices

Physical confirmations:

- Ultra24 / `R5CX15JX98E` main Daily Testing profile recovered
- Original Workspace calendar: OK
- Original Workspace timeclock: OK
- Original Workspace prepared profiles: OK
- `DRAGONFLY SPACE` opens fresh and unused
- Dragonfly Startpage shows: "Richte Deinen Schichtplan ein um alle Features zu nutzen"
- 2026-05-02 A/B write-isolation QA:
  - Space B / `DRAGONFLY SPACE` got Space-Schichtmuster Vault entry `TEST-DRAGONFLY-ISO`
  - after switching back to Space A / original Workspace, the entry was not visible there
  - reverse test: Space A / original Workspace got Space-Schichtmuster Vault entry `TEST-AOCC-ISO`
  - after switching to Space B / `DRAGONFLY SPACE`, the entry was not visible there
  - result: PASS for A/B Vault write isolation in both directions
  - cross-device test: `TEST-AOCC-ISO` created on Ultra24 in Space A was visible on Poco in Space A
  - result: PASS for Ultra24 -> Poco Space A Vault sync
  - reverse cross-device test: `TEST-POCO-AOCC-SYNC` created on Poco in Space A was visible on Ultra24 in Space A
  - result: PASS for Poco -> Ultra24 Space A Vault sync
  - Space A Vault sync is now physically confirmed in both device directions
  - blocker during Space B cross-device QA: Poco had no visible `Per QR beitreten` route while already belonging to Space A
  - fix: `app/(space)/choose.tsx` now shows `Per QR beitreten` in the non-empty Spaces state, routing to existing `/(space)/join`
  - validation after fix: `npm run typecheck` PASS, `npm test` PASS, `npm run ops:android:release-install` PASS with exit code 0
  - physical follow-up: Poco could join `DRAGONFLY SPACE` by QR using restored `Per QR beitreten`
  - result: PASS for additional-Space QR join route
  - Space B cross-device test: `TEST-DRAGONFLY-ISO` created on Ultra24 in `DRAGONFLY SPACE` was visible on Poco in `DRAGONFLY SPACE`
  - result: PASS for Ultra24 -> Poco Space B Vault sync
  - reverse Space B cross-device test: `TEST-POCO-DRAGONFLY-SYNC` created on Poco in `DRAGONFLY SPACE` was visible on Ultra24 in `DRAGONFLY SPACE`
  - result: PASS for Poco -> Ultra24 Space B Vault sync
  - current Vault QA conclusion: Space A and Space B both PASS for isolation and bidirectional cross-device sync
  - active Space device-local test: Ultra24 stayed active in Space A while Poco stayed active in Space B
  - result: PASS; `currentSpaceId` does not force-switch other devices
  - delete semantics test with disposable `DELETE-TEST-SPACE`: FAIL, Space appeared again after delete/restart/sync
  - fix: added local deleted-Space tombstones and filtered tombstoned Spaces in `syncTeamSpaces()` before push and after pull; deliberate create/join/rejoin clears tombstone
  - validation after delete fix: `npm run typecheck` PASS, `npm test` PASS, `npm run ops:android:release-install` PASS on both devices
  - retest with fresh disposable `DELETE-TEST-SPACE-2`: PASS, Space stayed deleted after restart/sync
  - final old-problem retest: original `DELETE-TEST-SPACE` is now cleanly deletable after tombstone fix
  - product/UX rule: manual close/reopen is only a QA stress test; real users should only delete the Space and YASA handles tombstone, UI removal, backend cleanup/resync, and rehydration prevention invisibly
  - Space C created on Ultra24: `FINAL-ISO-SPACE`
  - three-Space Vault isolation:
    - Space C opened fresh and active
    - Space C Vault was fresh and did not show Space A/B entries
    - `TEST-FINAL-C-ISO` created in Space C was visible in Space C
    - `TEST-FINAL-C-ISO` was not visible in Space A
    - `TEST-FINAL-C-ISO` was not visible in Space B
    - result: PASS for A/B/C Vault write isolation
  - Space C cross-device Vault sync:
    - Poco joined `FINAL-ISO-SPACE` by QR
    - `TEST-FINAL-C-ISO` created on Ultra24 was visible on Poco in Space C
    - `TEST-POCO-FINAL-C-SYNC` created on Poco was visible on Ultra24 in Space C
    - result: PASS for bidirectional Space C Vault sync
  - current Vault QA conclusion: Space A, Space B, and Space C all PASS for bidirectional cross-device Vault sync

Night checkpoint 2026-05-02:

- Space Cleanup is safe for normal/disposable Space delete after tombstone fix.
- The original first Space delete remains an explicit high-risk destructive QA boundary and has not been physically tested.
- Recommended next step:
  - run final Space Cleanup QA Gate
  - then start `Prepared ID Profiles in Shiftpals`

Tomorrow 2026-05-01:

1. Visual QA Admin spacing on Ultra24.
2. Protected active-Space switching QA.
3. Three-Space isolation QA: original Workspace, `DRAGONFLY SPACE`, third fresh Space.
4. Controlled write test: data entered in B must not appear in A/C.
5. Delete semantics QA with a disposable Space first.
6. Remaining storage audit for profile-wide vs Space-scoped keys.
7. Final decision gate: Space Cleanup complete or exact residual risks documented.

High-priority next feature slice after Space gate:

- Prepared ID profiles from `ID-Profile Vorbereitung` should appear in `Meine Shiftpals` / `Heute im Team` when they are in the same Space and have the same derived shift on the viewed day.
- Prepared profiles must be clearly marked as prepared/future profiles and must not become permission-bearing active members before QR transfer.
- SSOT task: `YASA-Obsidian-Brain/wiki/prepared-profiles-in-shiftpals-task.md`

## Production Day 2026-04-29: Space-scoped Shift Plans

Status: Implementierung PASS in technischer QA; Device-QA-Fund nachgezogen; Release am 2026-04-30 auf beide Geräte installiert; finale Physical QA noch offen.

Critical Incident 2026-04-30:

- Ultra24 / `R5CX15JX98E` is the user's main Daily Testing device.
- After the strict Space-isolation build, the original Workspace data appeared fully reset on Ultra24.
- The install script uses `adb install -r`; no `pm clear` or uninstall is present.
- Android package state still showed the original install date, so the likely issue was hidden legacy data, not an intentional data wipe.
- Root cause: original Workspace reads became strict before legacy profile-scoped data had been migrated into `spaceId::profileId`.
- Fix: original/oldest Space for a profile now copies missing legacy operational data into scoped keys on first access.
- Later-created Spaces, including `DRAGONFLY SPACE`, remain fresh and do not receive legacy data.

Recovery validation:

- Regression added in `lib/__tests__/timeclock.test.ts`:
  - original Workspace migrates legacy data
  - later Space remains fresh
- `npx sucrase-node lib/__tests__/timeclock.test.ts`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS on both devices
- Physical recovery confirmation on Ultra24:
  - main test ID profile is back
  - first review shows Workspace data present again
  - latest timeclock stamp times are visible
  - recently prepared ID profiles from `ID-Profile vorbereiten` are visible
- Physical Space-isolation confirmation on Ultra24:
  - Original Workspace calendar: OK
  - Original Workspace timeclock: OK
  - Original Workspace prepared profiles: OK
  - `DRAGONFLY SPACE` opens as fresh/unused
  - Startpage shows expected setup hint: "Richte Deinen Schichtplan ein um alle Features zu nutzen"
  - no Workspace data visible in Dragonfly during read-only check

Active Space / Space Lobby implementation 2026-04-30:

- `Mein Space` / `Deine Spaces` is now a safe Space Lobby, not the casual write-context switch.
- Inactive Spaces no longer activate through `Dienstplan` or `Heute im Team`.
- Direct tool entry points remain available only for the currently active Space card.
- Inactive Space cards guide to the protected Admin/control flow for activation.
- Admin activation is available to every Space member for their own device context.
- Dangerous/authority-bearing actions remain role-bound.
- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS on both devices

Admin UI spacing pass 2026-04-30:

- Trigger: uploaded Admin-Bereich screenshot showed that spacing rules were not being respected.
- Design references used: `YASA-Obsidian-Brain/wiki/Design.md` and `YASA-Obsidian-Brain/wiki/design-guardrails.md`.
- Implementation scope: style-only pass in `app/(admin)/index.tsx`.
- No storage, routing, permission, Space activation, QR, delete, profile-transfer, or admin routine logic was changed.
- Adjusted vertical rhythm/card spacing/action rows/profile edit/danger zone/back area and minimum action touch targets.
- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS on both devices

Architektur-SSOT:

- `YASA-Obsidian-Brain/wiki/space-isolation-principle.md`

Kernregel:

- Ein Space ist keine Filteransicht auf gemeinsame Daten.
- Ein Space ist eine vollständige, isolierte YASA-Arbeitsumgebung.
- Neue Spaces starten frisch, stellen aber alle YASA-Funktionen bereit.
- Active-Space Reads dürfen niemals auf Daten eines anderen Space zurückfallen.

Umgesetzt:

- Neue ShiftPlan-Key-Strategie: `spaceId::profileId`.
- Legacy-Pläne unter `profileId` bleiben lesbar, werden aber nicht automatisch in einen Space kopiert.
- Neues Storage-API:
  - `buildSpaceProfileKey(spaceId, profileId)`
  - `getShiftPlanForSpace(spaceId, profileId)`
  - `saveShiftPlanForSpace(spaceId, plan)`
  - `getShiftForDateForSpace(spaceId, profileId, dateISO)`
  - `getShiftPlanFromMapForSpace(allPlans, spaceId, profileId)`
- Neue Pläne aus Schicht-Setup und Profile-Transfer werden Space-scoped gespeichert.
- Kalender, Startscreen, Heute, Tagesdetails, Swap-Kandidaten, Stempeluhr und Zeitkonto lesen den Plan aus dem aktiven Space.
- Ghost-Präsenzpläne werden ebenfalls Space-scoped gespeichert/synchronisiert.
- Supabase `shift_plans.profile_id` wird kompatibel mit dem Storage-Key `spaceId::profileId` genutzt; keine DB-Migration nötig.
- Löschen eines Space entfernt lokale ShiftPlans mit Prefix `spaceId::`.

QA-Fund und Fix:

- Device-A-Test zeigte: nach Switch in den später erstellten `DRAGONFLY SPACE` blieb die App faktisch in der Datenumgebung von Space A.
- Ursache: der kompatible Legacy-Fallback las bei fehlendem `spaceId::profileId` weiter den alten `profileId`-Plan.
- Fix: Space-Kontext ist jetzt strikt. Ein Space ohne eigenen scoped Plan startet leer.
- Kalender/Tagesdetails/Stempeluhr/Zeitkonto nutzen für sichtbare Einträge ebenfalls scoped Storage-Keys für Urlaub, Overrides, DayChanges, X-Ausgleich, Zeitkonto und Stempeluhr-Daten.
- Dadurch darf ein später erstellter Space ohne eigene Einträge nicht mehr Daten aus Space A anzeigen.

Bewusste Restgrenze / Phase 4 Audit:

- Die sichtbaren operativen Datenpfade für Kalender, Tagesdetails, Stempeluhr und Zeitkonto wurden scoped nachgezogen.
- Remaining Storage Audit 2026-05-02 abgeschlossen; SSOT: `YASA-Obsidian-Brain/wiki/remaining-storage-audit-2026-05-02.md`.
- Klassifiziert 2026-05-02: `SHIFT_COLOR_OVERRIDES` ist für persönliche Kalenderansichten bewusst personal/profile-level. Jedes Member darf seine eigene Farbcodierung verwenden; die semantische Wahrheit bleibt das Day-Chip-Label, z. B. `N = Nachtdienst`.
- Für spätere Community-Kalenderansichten gilt: Darstellung muss die vom Space-Host etablierte Host/Space-Farbcodierung verwenden. Eine Mischung persönlicher Farben wäre in einer gemeinsamen Ansicht nicht aussagekräftig.
- Nach User-Erinnerung gibt es aktuell keine Community-Kalenderansichten.
- Klassifiziert 2026-05-02: `TIME_ACCOUNT_UI` ist Space-scoped UI-State, weil die Summary-Version aus Space-spezifischem Plan/Regelprofil/Zeitkonto entsteht.
- Klassifiziert 2026-05-02: `TIMECLOCK_TEST_PROMPT`, `TIMECLOCK_QA_CALENDAR`, `TIMECLOCK_UI`, `TIMECLOCK_CONFIG` und `TIMECLOCK_EVENTS` sind im aktiven Space Space-scoped über `spaceId::profileId`.
- Klassifiziert 2026-05-02: `SPACE_STATUS_SEEN` darf profile-level bleiben, weil es persönlicher Seen/Notification-State ist; Events tragen `spaceId` und eindeutige IDs.
- Klassifiziert 2026-05-02: Prepared ID Profiles sind Space-scoped Host-Vault-Daten, gespeichert als `spaceId -> PreparedIdProfile[]` und werden beim Space-Delete bereinigt.
- Fix 2026-05-02: `app/(services)/time-account.tsx` liest Stempeluhr Config/Events/QA-Kalender jetzt im aktiven Space über `spaceId::profileId`.
- Fix 2026-05-02: `app/(shift)/day-detail.tsx` nutzt Space-scoped Stempeluhr Config für X/U Required-Hours.
- Fix 2026-05-02: `app/(shift)/calendar.tsx` nutzt Space-scoped `TIME_ACCOUNT_UI` für das Zeitkonto-Modal-Dismiss.
- Validation: `npm run typecheck`: PASS.
- Validation: `npm test`: PASS.
- Weiter zu prüfen: Backend-Sync für scoped ShiftPlans und Delete-Cleanup im finalen Gate.
- Space-Löschung muss nochmals mit mehreren Spaces geprüft werden, insbesondere wenn der ursprüngliche erste Space gelöscht wird.

Validierung:

- `npm run typecheck`: PASS
- `npm test`: PASS
- zusätzliche Regressionen in `lib/__tests__/timeclock.test.ts`:
  - Space-Plan gewinnt vor Legacy-Plan
  - Space-Plan ohne eigenen Eintrag bleibt leer statt Legacy zu zeigen
- Direct install on the only visible device `R5CX15JX98E`: PASS
- Standard Dual-Device-Install ist aktuell blockiert, weil ADB nur Device B listet.
- Das vom Install-Skript erwartete zweite Gerät `KNMVMVGY89NFHAQ4` ist aktuell nicht sichtbar, auch nach `adb kill-server` / `adb start-server`.
- Device-Labels morgen verifizieren: ältere Resume-Notiz nennt `R5CX15JX98E` als Device A, der aktuelle Script-Fehler nennt `KNMVMVGY89NFHAQ4` als Device A.
- Finale Physical QA offen: mindestens drei Spaces testen, inklusive Original-Space, später erstelltem `DRAGONFLY SPACE` und einem dritten frischen Space.

Re-Gate 2026-04-30:

- `adb devices -l`: beide Geräte sichtbar
  - `KNMVMVGY89NFHAQ4`
  - `R5CX15JX98E`
- `npm run ops:android:release-install`: PASS
  - Build PASS
  - Install auf Device A `KNMVMVGY89NFHAQ4`: PASS
  - Install auf Device B `R5CX15JX98E`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS

Morgen direkt fortsetzen:

1. Physical QA: in Space B/C dürfen keine Einträge aus Space A erscheinen.
2. In Space B neue Einträge anlegen und prüfen, dass sie nicht in Space A/C sichtbar werden.
3. Originalen ersten Space löschen und prüfen, dass die übrigen Spaces und das ID-Profil stabil bleiben.
4. Phase-4-Audit gegen unsafe profile-wide Reads/Fallbacks abschließen.

## OFF-Flow 2026-04-28: Space-Isolation / Admin-Switching

Status: erster Fix implementiert, technische QA PASS, auf beide Devices ausgerollt.

Problem:

- Admin hatte mehrere Spaces, aber keinen klaren aktiven Arbeits-Space.
- Ein Testspace konnte lokal gelöscht werden, aber durch Backend-Sync potentiell wieder erscheinen.
- Bei mehreren Spaces darf YASA nicht heimlich den Arbeitskontext wechseln.

Implementiert:

- Admin zeigt pro Space, ob dieser aktiv ist.
- Admin kann einen Space explizit aktivieren (`currentSpaceId`).
- Delete versucht zusätzlich Backend-Cleanup:
  - Owner: Space Row löschen
  - Fallback: eigene Membership entfernen
- Lokales Löschen räumt Space-gebundene Daten auf:
  - Urlaubsvorplanung
  - Space-Regelprofil
  - Infoservice-Status
  - Prepared ID Profiles
  - Swaps
  - Ghosts/Ghost-Schichtpläne
- Zeitkonto auto-heilt nur noch bei genau einem Space. Bei mehreren Spaces gibt es keinen stillen Wechsel mehr.
- Neue Supabase Migration:
  - `docs/backend/supabase_add_space_delete_policies.sql`

Wichtige Grenze:

- Schichtpläne sind historisch noch `profileId`-basiert, nicht `spaceId + profileId`-basiert.
- Für 100 Prozent autarke Spaces muss als nächster Architekturstep Space-scoped ShiftPlan Storage umgesetzt werden.

Validierung:

- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS auf Device A und Device B

## Nächster Production Day: 2026-04-29

Einzige Hauptaufgabe:

Space Cleanup / Space Isolation.

Plan liegt im Obsidian Dev Brain:

`YASA-Obsidian-Brain/wiki/space-cleanup-production-day.md`

Morgen keine OFF-Flows.

Ziel:

- Spaces als autarke Arbeitsräume stabilisieren
- aktiven Space eindeutig machen
- Delete lokal und remote sauber machen
- Space-scoped Storage sauber klassifizieren und refactoren
- insbesondere ShiftPlan von profile-scoped Richtung Space-scoped bringen
- am Ende technischer QA-Gate, Device Rollout und Physical QA

## OFF-Flow Feature 2026-04-28: Host ID Profile Transfer

Ziel:

- Der Space-Host kann ein obfuskiertes ID-Profil für ein Team-Member erstellen/vorbereiten.
- Ein YASA ID-Profil ist in YASA der Account.
- Der Host kann so viele ID-Profile/Accounts anlegen, wie für sein reales Team notwendig sind.
- Diese ID-Profile sollen perspektivisch so weit wie möglich vorkonfiguriert werden, bevor sie übertragen werden.
- Das neue/fremde Gerät kann dieses vorbereitete Profil per Transfer-QR übernehmen.
- Der Transfer-QR enthält zusätzlich die Space-Einladung, sodass Profil und Space in einem Flow eingerichtet werden.
- Der bestehende Weg bleibt erhalten: Member können weiterhin selbst ein ID-Profil erstellen und den normalen Space-QR scannen.

Produktkorrektur 2026-04-28:

- Der Host bereitet nicht nur den Einstieg vor.
- Der Host erstellt schlüsselfertige YASA Accounts/ID-Profile soweit technisch möglich.
- Dazu gehört als nächster logischer Ausbau die Auswahl/Zuweisung des Dienstplanmusters aus dem Vorlagen-/Schichtmuster-Vault.
- Der Host übereignet das vorbereitete ID-Profil später an das reale Team-Member.

Implementiert:

- Host-only Screen `app/(space)/profile-transfer.tsx`
- Host-side Prepared-ID-Profile-Vault/List
- mehrere vorbereitete ID-Profile pro Space
- vorbereitete ID-Profile sind nach dem Anlegen weiter bearbeitbar
- optionale Dienstplanmuster-Zuweisung aus dem Space-Schichtmuster-Vault
- Dienstplanmuster-Zuweisung nutzt jetzt die originale YASA-Verankerungslogik:
  - Host wählt, welcher Zyklus-Tag des Musters heute gilt
  - YASA berechnet daraus den echten Startanker
  - Transfer erzeugt daraus den persönlichen Schichtplan
- Transfer-QR Build/Parse Helper `lib/profileTransfer.ts`
- QR-Scanner akzeptiert normalen Space-QR und Transfer-QR
- Transfer-QR kann Profil + Space + Dienstplanmuster übertragen
- Empfängergerät speichert daraus direkt den persönlichen Schichtplan
- Startscreen ohne Profil zeigt zusätzlich `Transfer-QR scannen`
- Admin Space-Card hat owner-only `ID-Profil Transfer`
- Test `lib/__tests__/profileTransfer.test.ts`

Wichtige Produktregel:

- Dies ist ein Komfort-Onboarding- und Account-Vorbereitungs-Tool, keine Führungs-/Kontrollfunktion.
- Der Host wird dadurch nicht Boss.
- Keine Realnamen-Pflicht, kein unnötiges PII.
- Geräte mit bereits vorhandenem fremden Profil werden nicht überschrieben.

Aktuelle Einschränkung:

- v1.1 hat bereits lokale vorbereitete-ID-Profil-Liste/Vault und Dienstplanmuster-Zuweisung.
- Noch offen: backend-gestützter Prepared-Account-State, Single-Use Transfer, Ablaufzeit/Invalidierung.

Validierung bisher:

- `npm run typecheck`: PASS
- `npx sucrase-node lib/__tests__/profileTransfer.test.ts`: PASS, inkl. Dienstplanmuster-Payload und Heute-im-Muster-Index
- `npm test`: PASS
- Release APK wurde erzeugt: `android/app/build/outputs/apk/release/app-release.apk`
- `npm run ops:android:release-install`: PASS
- Release APK wurde gebaut und auf Device A (`KNMVMVGY89NFHAQ4`) sowie Device B (`R5CX15JX98E`) installiert.
- Physical QA 2026-04-28: PASS

Festgezurrter Algorithmus:

- `pattern[0]` gehört zum berechneten Startanker.
- Der Host wählt beim vorbereiteten ID-Profil den Zyklus-Tag des ausgewählten Dienstplanmusters, der heute für den zukünftigen Eigentümer gilt.
- YASA berechnet daraus `anchorDateISO = heute - patternTodayIndex`.
- Der Transfer-QR enthält Profil, Space, Dienstplanmuster, berechneten Anker und `patternTodayIndex`.
- Das Empfängergerät erzeugt daraus den persönlichen Schichtplan.
- Bestehendes Self-Onboarding und normaler Space-QR bleiben unverändert.

---

## Letzter stabiler Checkpoint: YASA Infoservice / Information System
**Datum**: 2026-04-27
**Status**: Physical QA PASS

## Locked Checkpoint 2026-04-27

User-Bestätigung:

> Alles funktioniert perfekt!!!

Festgezurrter Stand:

- `Shiftpals Tagesdetails -> Schicht ändern` unterstützt jetzt `X`, `U`, `K`, `EK`.
- `K = Krank`.
- `EK = entschuldigt Krank`.
- `K` und `EK` sind Status-/Off-Codes und dürfen nicht wie reguläre Arbeitsdienste gezählt werden.
- Tagesstatus-Änderungen erzeugen YASA Infoservice Events.
- Infoservice Events werden lokal gespeichert und über Supabase `spaces.status_events_json` kommuniziert.
- Supabase-Migration für `status_events_json` wurde angewendet.
- Physical QA bestätigt: Statusänderungen von Device A werden an Device B kommuniziert.
- Infoservice ist **nicht** Space-Broadcast, sondern Shiftpal-relevant.
- `audience = shiftpals`.
- `targetShiftCode` ist die ursprünglich betroffene Schicht.
- Empfänger sehen ein Event nur, wenn ihr eigener Dienst am betroffenen Tag zu `targetShiftCode` passt.
- Der Actor sieht eigene Events im Infoservice.
- Popup erscheint nur für andere relevante Member, nicht für den Actor.
- Popup-Seen-State ist per Profil gespeichert (`yasa.spaceStatus.seen.v1`).

Aktuelle Popup/Listentexte:

- `X`: `🙂 xyz hat sich für die heutige Nachtschicht frei genommen.`
- `EK`: `xyz hat sich für den heutigen Dienst EK gemeldet.`
- `K` ein Tag: `xyz hat sich für den heutigen Dienst K gemeldet.`
- `K` mehrere zusammenhängende gespeicherte Tage: `xyz hat sich für die kommenden x Tage K gemeldet.`

Infoservice-Semantik:

- Statusmeldungen informieren Shiftpals über kurzfristige Dienstplan-Statusänderungen.
- Statusrelevant sind: `frei genommen`, `EK`, `K`.
- Nicht statusrelevant ist, welche Ausgleichswährung intern benutzt wurde.
- GLZ, Urlaub, W-Tag, Feiertagsstunden und Vorfesttagsstunden sind Abrechnungs-/Guthabenquellen im Hintergrund.
- Wenn Urlaub als Ausgleich für Freizeit eingesetzt wird, lautet der Teamstatus weiterhin `frei genommen`.
- Wenn nur das Ausgleichskonto eines bereits frei genommenen Tages geändert wird, entsteht keine neue Statusmeldung.
- Jahresurlaub aus Urlaubsvorplanung ist kein kurzfristiges Infoservice-Statusereignis.
- Änderungen an vergangenen Tagen sind Nachpflege/Korrektur und erzeugen keine Infoservice-Statusmeldung.
- Infoservice-Statusmeldungen sind nur für aktuelle und zukünftige operative Relevanz gedacht.

Aktuelle Einschränkung:

- Mehrtägiges `K` wird aus bereits zusammenhängend gespeicherten `K`-Tagen abgeleitet. Ein dedizierter Mehrtage-Krankmelde-Dialog ist später sinnvoll.

Validierung:

- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run ops:android:release-install`: PASS auf Device A und Device B
- `npm run typecheck` nach Past-Date-Suppression: PASS
- `npm test` nach Past-Date-Suppression: PASS

Nächster sinnvoller Einstieg:

1. Infoservice Feinschliff: Popup-Verhalten, gesehen/ungesehen, Unread-Indikator.
2. Weitere Event-Produzenten: Diensttausch, Urlaubsvorplanung.
3. Danach zurück zur Urlaubsvorplanung v1.

---

## Historischer Stand: Sprint A1 (Stabilisierung)
**Datum**: 2025-02-20
**Status**: QA PASS

## Feature-Matrix

| Feature | Iteration | Status |
|---------|-----------|--------|
| Profil erstellen (Obfuscated) | 1 | DONE |
| Space erstellen | 2 | DONE |
| Space beitreten (QR) | 3 | DONE |
| Dienstplan Setup (Pattern Editor) | 4 | DONE |
| Kalender (Monatsansicht, Scroll) | 5 | DONE |
| Startscreen Refactor | 6 | DONE |
| Heute-Ansicht (Kollegen) | 7 | DONE |
| Ghost-Mitglieder | 8 | DONE |
| Urlaub/Vacation | 9 | DONE |
| Schichttausch (Swap) | 10 | DONE |
| Swap Hotfixes (#1 Space-Check, #2 kein auto-X, #3 Datum-Validierung) | 10.1 | DONE |
| Services Hub | 14 | DONE |
| Admin Safetylock (3-Step, Biometric) | 14 | DONE |
| Calendar Modal + Pulse Animation | 14 | DONE |
| Startscreen v2 (Services CTA) | 16 | DONE |
| Refactor: Deduplizierung, SSOT Constants, dead code, any-Leaks | 17 | DONE |
| Hotfix: 2x useState\<any\> -> UserProfile \| null | 17.1 | DONE |
| Hotfix: isStrategyApplied .some()->.every() + acceptSwap Write-Order | 17.2 | DONE |
| Swap-Badge Notifications (Startscreen Banner + Services Hub Badge) | 18 | DONE |
| A1-02: Membership Guards (candidates, admin) | A1 | DONE |
| A1-03: Storage Write Patterns (auditiert, keine Aenderungen noetig) | A1 | DONE |
| A1-04: Ghost Cleanup bei deleteSpace | A1 | DONE |
| A1-05: Logging (lib/log.ts + 7 Integrationspunkte) | A1 | DONE |

## TypeScript Status
- `tsc --noEmit`: CLEAN (0 Fehler)
- `useState<any>` im app/: 0 Treffer
- `: any` im app/: 0 Treffer

## Architektur-Score: 8.5/10
## Security-Score: 7/10

## Bekannte technische Schuld
- Race Conditions bei Concurrent Writes (AsyncStorage read-modify-write) – akzeptiert fuer MVP
- Layout-Level Navigation Guards nur teilweise konsistent:
  - vorhanden in `(team)`, `(swap)`, `(services)` (Profil-Guard)
  - fehlen noch als einheitliches Muster in den restlichen Gruppen (TICKET-20 READY)
- ~~Ghost-Daten bleiben nach Space-Loeschung erhalten~~ GEFIXT (A1-04)
- Biometric Re-Auth nur einmal pro Focus (kein Timeout)
- formatGerman existiert in 2 lokalen Varianten (bewusst)
- Warning-Farben hardcoded statt in Theme (TICKET-23 Backlog)

## Aktuelle SSOT-Dokumente (2026-03)
- `docs/ai/TIME_DATA_OWNERSHIP_SHEET.md` (Datenhoheit Time/Regeln/Urlaub/Voice-Basis)

## Aktive Roadmap (Stand 2026-03-24)
- `docs/ai/NEXT_SESSION_ROADMAP_2026-03-24.md` ist die aktuellste gueltige Session-Roadmap.
- Scale-Readiness v1 Top-5 priorisiert: `docs/ai/SCALE_READINESS_TOP5_2026-03-25.md`

## Codebase-Analyse Check (2026-03-24)
- Stack bestaetigt: React Native `0.81.5`, Expo SDK `54`, Expo Router, TypeScript `5.9.2` strict.
- TypeScript-Qualitaet bestaetigt: in `app/lib/types/components/constants` keine `any`-Treffer.
- Projektstruktur bestaetigt: 8 Routing-Gruppen unter `app/`.
- Supabase-Status praezisiert: Client/Auth/Health-Bausteine in `lib/backend` vorhanden, aber noch ohne produktive Anbindung an Screens/Flows.
- Wartbarkeits-Hotspots bestaetigt:
  - `lib/storage.ts` hat `2010` Zeilen.
  - grosse Screens: `(shift)/setup.tsx` `1352`, `(services)/timeclock.tsx` `1342`, `(shift)/calendar.tsx` `1299`.
- Testabdeckung erweitert: 3 Engine-Testdateien (`shiftEngine`, `timeclock`, `strategyEngine`) + `timeAccountEngine`; keine UI-Test-Suite.

## Timeclock/TimeAccount Fortschritt (2026-03-24)
- Zentrale Engine aktiv: `lib/timeAccountEngine.ts`
- Stempeluhr + Urlaubs-/Freizeitkonto nutzen dieselbe Monatslogik (`Soll/Ist/Delta`)
- Tariflogik auf Intervallbasis (Feiertag/Vorfest-Split ueber Mitternacht)
- Gleitzeit-Regel aktiv: `credited = min(paidFlexMinutes, early + late)`
- Brueckentag-Strategie: Shift-plan-aware (24/7 vs. klassisch) in `lib/storage.ts`
- Strategie-Apply schreibt jetzt ebenfalls Day-Change-Historie (wie manuelles Urlaub-Setzen)
- KS/KN-Antragsreminder aktiv:
  wenn Urlaubstage auf `KS`/`KN` fallen, erzeugt YASA ein Pflicht-Reminder-Modal auf dem Startscreen
  mit Eskalation:
  - > 7 Tage vor Termin: per "Spaeter erinnern" ausblendbar
  - <= 7 Tage vor Termin: verpflichtend bis "Antrag eingereicht" bestaetigt wurde
- QA-Run dokumentiert: `docs/qa/timeclock_run_2026-03-24.md`
- QA-Override (Feiertag/Vorfest) bleibt temporaer aktiv bis Brueckentage/Strategie-Block fertig ist

## Offener Ausbaupunkt (naechster Schritt)
- Brueckentag/Strategie fuer `KS`/`KN` erweitern:
  statt pauschalem Voll-Urlaubstag auch "Stunden-Guthaben einsetzen" als Optimierungspfad anbieten
  (z. B. KS mit 5h Guthaben in ganzen freien Tag umwandeln, wenn Regelprofil es erlaubt).

## Update 2026-03-25 (Roadmap Block A/B)
- Strategie-Modus `Stunden einsetzen` ist jetzt integriert (`vacation` + `hours`).
- Strategieliste zeigt Typ-Badge, benoetigte Stunden und Antragshinweis.
- `hours`-Apply ist aktiv und setzt aktuell Frei-Overrides (`X`) fuer die vorgeschlagenen Tage.

## Update 2026-03-25 (Scale-Readiness Umsetzung)
- P0 abgeschlossen: serialisierte Writes fuer kritische Storage-Maps (`TIMECLOCK_EVENTS`, `SHIFT_OVERRIDES`, `DAY_CHANGES`, `VACATION_SHORTSHIFT_REMINDERS`).
- P1 abgeschlossen: Strategie-Logik in `lib/strategyEngine.ts` extrahiert; `storage.ts` dient als I/O-Adapter.
- P1 abgeschlossen: Testausbau mit `strategyEngine.test.ts`; Testlauf deckt `shiftEngine`, `timeclock`, `strategyEngine` ab.
- P2 gestartet: Retention/Compaction fuer Reminder, DayChanges und exakte Timeclock-Event-Duplikate aktiv.
- Scale-Status dokumentiert in `docs/ai/SCALE_READINESS_TOP5_2026-03-25.md`.

## Update 2026-03-25 (QA Re-Gate)
- Neuer QA-Gate fuer `Strategy Hours Bank + Scale Hardening`: `PASS`.
- Referenz: `reports/kilo/QA_review_2026-03-25_strategy_hours_bank_regate.md`.
- `QA_review_latest.md` in beiden Report-Pfaden auf den neuen Gate-Stand synchronisiert.
