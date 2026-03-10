# QA Testplan – Iteration 8: Ghost User MVP

**Stand:** Iteration 8
**Tester:** _____________
**Datum:** _____________
**Build:** Expo Dev Build / Expo Go

---

## Voraussetzungen

- [ ] App ist installiert und lauffähig
- [ ] Ein aktives UserProfile existiert
- [ ] Mindestens ein Space existiert, in dem der Tester Owner ist
- [ ] Optional: Zweites Gerät/Profil als Mitglied im gleichen Space (für Rechte-Tests)

---

## Test 1: Owner erstellt Ghost

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 1.1 | Space-Liste öffnen → Space-Card → „Verwalten" | Manage-Screen öffnet sich |  |
| 1.2 | Scrolle zum Abschnitt „Ghost-Teammitglieder" | Abschnitt ist sichtbar, zeigt Info-Box und „+ Ghost hinzufügen" Button |  |
| 1.3 | Tippe „+ Ghost hinzufügen" | Modal öffnet sich mit Textfeld |  |
| 1.4 | Feld leer lassen → „Erstellen"-Button | Button ist disabled / nicht antippbar |  |
| 1.5 | Gib „Testghost A" ein | Avatar-Vorschau erscheint mit grünem Rahmen |  |
| 1.6 | Tippe „Erstellen" | Modal schließt, Ghost erscheint in der Liste mit Avatar + Label „Testghost A" + „Ghost"-Badge |  |
| 1.7 | Erstelle zweiten Ghost „Nachtschicht-Max" | Zweiter Ghost erscheint in der Liste |  |

---

## Test 2: Owner archiviert Ghost

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 2.1 | In der Ghost-Liste: Tippe „Archivieren" bei „Testghost A" | Bestätigungsdialog erscheint |  |
| 2.2 | Tippe „Abbrechen" im Dialog | Ghost bleibt in der Liste |  |
| 2.3 | Tippe erneut „Archivieren" → „Archivieren" bestätigen | Ghost verschwindet aus der aktiven Liste |  |
| 2.4 | Zähler neben „Ghost-Teammitglieder" hat sich reduziert | Count = 1 (nur noch „Nachtschicht-Max") |  |

---

## Test 3: Member kann Ghost als anwesend markieren

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 3.1 | Öffne „Heute im Team" Screen | Today-Screen lädt korrekt |  |
| 3.2 | Prüfe: Button „👻 Ghost als anwesend markieren" ist sichtbar | Button erscheint wenn mindestens 1 aktiver Ghost im Space |  |
| 3.3 | Tippe den Ghost-Button | Modal öffnet sich mit 2 Schritten |  |
| 3.4 | Schritt 1: Wähle „Nachtschicht-Max" | Ghost wird violett hervorgehoben, Häkchen erscheint |  |
| 3.5 | Schritt 2: Wähle Shift-Code „N" (Nachtschicht) | Code-Button bekommt schwarzen Rahmen |  |
| 3.6 | Tippe „Bestätigen" | Modal schließt, Ghost-Eintrag erscheint im „Ghosts heute" Bereich |  |
| 3.7 | Ghost-Eintrag zeigt: Avatar + „Nachtschicht-Max" + „N"-Badge + „Ghost"-Tag | Alles korrekt angezeigt |  |

---

## Test 4: Kalender zeigt Ghost-Eintrag

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 4.1 | Navigiere zum Kalender-Screen | Kalender lädt mit 4-Wochen-Ansicht |  |
| 4.2 | Finde den heutigen Tag | Heute-Zeile ist blau hervorgehoben |  |
| 4.3 | Unter dem heutigen Tag: Ghost-Eintrag sichtbar | Violette Bordüre links, Avatar (klein), „Nachtschicht-Max", „N"-Badge, „Ghost"-Tag |  |
| 4.4 | Ghost-Einträge an anderen Tagen sind leer | Nur am markierten Tag sichtbar |  |

---

## Test 5: Persistenz nach App-Neustart

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 5.1 | App komplett schließen (force quit) | – |  |
| 5.2 | App neu starten | – |  |
| 5.3 | Öffne „Verwalten" → Ghost-Abschnitt | „Nachtschicht-Max" ist noch da, „Testghost A" ist archiviert (nicht sichtbar) |  |
| 5.4 | Öffne „Heute im Team" | Ghost-Eintrag (Nachtschicht-Max, N) ist noch sichtbar |  |
| 5.5 | Öffne Kalender | Ghost-Eintrag am heutigen Tag ist noch sichtbar |  |

---

## Test 6: Rechte-Checks

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 6.1 | Als Nicht-Owner: Öffne manage.tsx | „Nur der Space-Ersteller kann verwalten" Hinweis, kein Ghost-Bereich |  |
| 6.2 | Als Mitglied: Öffne Today-Screen | „Ghost als anwesend markieren" Button ist sichtbar (alle dürfen markieren) |  |
| 6.3 | Als Mitglied: Markiere Ghost als anwesend | Funktioniert korrekt, Eintrag wird gespeichert |  |

---

## Test 7: Edge Cases

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 7.1 | Ghost mit leerem Namen erstellen | Button disabled, nicht möglich |  |
| 7.2 | Ghost mit 30 Zeichen langem Namen erstellen | Funktioniert, maxLength=30 |  |
| 7.3 | Gleichen Ghost-Namen zweimal erstellen | Erlaubt (verschiedene IDs) |  |
| 7.4 | Ghost markieren ohne Shift-Code zu wählen | „Bestätigen" Button disabled |  |
| 7.5 | Ghost markieren ohne Ghost zu wählen | „Bestätigen" Button disabled |  |
| 7.6 | Space ohne Ghosts: Today-Screen | Kein Ghost-Button sichtbar (korrekt ausgeblendet) |  |
| 7.7 | Alle Ghosts archiviert: Today-Screen | Kein Ghost-Button sichtbar |  |

---

## Test 8: Ghost Avatar

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 8.1 | Ghost erstellen → Avatar-Vorschau im Modal | Multiavatar wird deterministisch aus `spaceId:ghostLabel` generiert |  |
| 8.2 | Gleicher Ghost-Name in verschiedenen Spaces | Unterschiedliche Avatare (verschiedene Seeds wegen spaceId) |  |
| 8.3 | Ghost in Liste (manage.tsx) | Avatar wird korrekt angezeigt |  |
| 8.4 | Ghost in Today-Screen | Avatar wird korrekt angezeigt |  |
| 8.5 | Ghost in Kalender | Kleiner Avatar (24px) korrekt sichtbar |  |

---

## Ergebnis

| Kategorie | Bestanden | Fehlgeschlagen | Offen |
|-----------|-----------|----------------|-------|
| Ghost CRUD | /7 | | |
| Presence Marking | /5 | | |
| Kalender | /4 | | |
| Persistenz | /5 | | |
| Rechte | /3 | | |
| Edge Cases | /7 | | |
| Avatar | /5 | | |
| **Gesamt** | **/36** | | |

---

*Erstellt für Iteration 8 – Ghost User MVP*
