# QR-Join Local Import Fix

**Datum:** 2026-03-04
**Task:** QR-Join muss als lokaler Space-Import funktionieren, komplett offline und ohne Backend.
**Status:** ✅ COMPLETED

---

## Problem

Der bisherige QR-Join hatte ein fundamentales Problem:
- Der QR-Code enthielt nur `spaceId` + `token`
- Gerät B hat nach dem Scan versucht, den Space lokal zu finden (`getSpaces()`)
- Da der Space nur auf Gerät A existiert, gab es einen "Space nicht gefunden" Fehler
- Dies machte den QR-Join zwischen zwei verschiedenen Geräten unbrauchbar

---

## Lösung

### 1. Erweiterte QR-Payload

**Datei:** [`yasa/app/(space)/qr.tsx`](../../yasa/app/(space)/qr.tsx)

Der QR-Code enthält jetzt folgende Parameter:
- `spaceId` - Space-ID
- `name` - Space-Name (URL-kodiert)
- `ownerId` - Owner-Profil-ID
- `ownerName` - Owner-Anzeigename (URL-kodiert)
- `token` - Invite-Token

```typescript
const payload = `yasa://join?spaceId=${space.id}&name=${encodeURIComponent(space.name)}&ownerId=${space.ownerProfileId}&ownerName=${encodeURIComponent(space.ownerDisplayName)}&token=${space.inviteToken}`;
```

### 2. Neue Storage-Funktion: importSpaceFromInvite

**Datei:** [`yasa/lib/storage.ts`](../../yasa/lib/storage.ts)

Neue Funktion die:
1. Prüft ob Space bereits lokal existiert
2. Wenn ja: Token validieren und als Member hinzufügen
3. Wenn nein: Space aus QR-Metadaten erstellen mit Owner + User als Mitglieder
4. `currentSpaceId` setzen

```typescript
export async function importSpaceFromInvite(
  payload: { spaceId, name, ownerProfileId, ownerDisplayName, inviteToken },
  profile: UserProfile
): Promise<{ ok: true; space: Space } | { ok: false; reason: string }>
```

### 3. Aktualisierter Join-Screen

**Datei:** [`yasa/app/(space)/join.tsx`](../../yasa/app/(space)/join.tsx)

- Payload-Parser unterstützt jetzt neue und legacy QR-Formate
- `handleBarCodeScanned`: Zeigt Space-Name aus Payload oder lokalem Storage
- `handleConfirmJoin`: Entscheidet ob Import (neues Format) oder klassischer Join (Legacy)
- **Backward Compatibility:** Alte QR-Codes mit nur `spaceId` + `token` funktionieren weiterhin

---

## Akzeptanzkriterien

| # | Kriterium | Status |
|---|-----------|--------|
| 1 | Gerät A erstellt Space | ✅ Bereits vorhanden |
| 2 | Gerät A zeigt QR | ✅ Bereits vorhanden |
| 3 | Gerät B scannt QR | ✅ Bereits vorhanden |
| 4 | Space wird lokal auf Gerät B angelegt/importiert | ✅ Implementiert |
| 5 | User auf Gerät B wird Mitglied | ✅ Implementiert |
| 6 | `currentSpaceId` wird gesetzt | ✅ Implementiert |
| 7 | kein "Space nicht gefunden" mehr | ✅ Implementiert |
| 8 | Mehrfacher Scan bleibt stabil | ✅ Idempotent implementiert |
| 9 | `npm run typecheck` -> grün | ✅ 0 Errors |
| 10 | `npm test` -> grün | ✅ 37 Tests bestanden |

---

## Test-Ergebnisse

```
cd yasa && npm run typecheck
> tsc --noEmit
> ✅ Exit code 0

cd yasa && npm test
> sucrase-node lib/__tests__/shiftEngine.test.ts
> 37 bestanden, 0 fehlgeschlagen
```

---

## Bewusst NICHT implementiert

1. **QR-Code mit Member-Listen:** Die QR-Payload enthält nur Owner-Info, nicht alle Mitglieder. Dies wäre möglich gewesen, aber:
   - Würde den QR-Code unnötig vergrößern
   - Ist für den typischen Use-Case nicht nötig (neuer User braucht nur den Space, nicht alle Mitglieder)
   - Owner-Member reicht für Anzeige

2. **Automatischer Import ohne Bestätigung:** Der User muss weiterhin den Join bestätigen:
   - Sicherheitsaspekt bleibt erhalten
   - User sieht was er importiert

3. **Echtzeit-Sync:** Kein Backend-Sync implementiert (wie gewünscht - komplett offline)

---

## Rest-Risiken

1. **URL-Encoding Edge Cases:** Falls Space-Name spezielle Zeichen enthält, könnte es theoretisch zu Problemen kommen. Ist aber durch `encodeURIComponent` abgedeckt.

2. **Alte QR-Codes ohne Token-Validierung:** Falls ein alter QR-Code mit manipuliertem Token gescannt wird, wird er korrekt abgelehnt.

3. **Avatar-URL fehlt:** Bei neu importierten Spaces hat der Owner keine Avatar-URL (`''`). Dies ist ein optisches Problem, aber kein Funktionsproblem.

4. **Mehrfacher Join-Versuch:** Wenn ein User einen QR mehrfach scannt, wird er jedes Mal als Member hinzugefügt (idempotent), aber der User sieht jedes Mal die Bestätigung. Dies könnte als "nervig" empfunden werden, ist aber sicher.

---

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `yasa/app/(space)/qr.tsx` | QR-Payload mit Space-Metadaten erweitert |
| `yasa/lib/storage.ts` | `importSpaceFromInvite()` Funktion hinzugefügt |
| `yasa/app/(space)/join.tsx` | Payload-Parser + Join-Logik aktualisiert für Import + Backward Compatibility |

---

## Report written to: yasa/reports/kilo/QR_Join_Local_Import.md
