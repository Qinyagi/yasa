# QA Testplan – Iteration 8.5: Swipeable Monatskalender

**Stand:** Iteration 8.5
**Tester:** _____________
**Datum:** _____________
**Build:** Expo Dev Build / Expo Go

---

## Voraussetzungen

- [ ] App ist installiert und lauffähig
- [ ] Ein aktives UserProfile existiert
- [ ] Ein Schichtplan ist eingerichtet (mindestens 4 Wochen generiert)
- [ ] Optional: Ghosts im Space mit mindestens einem heutigen Shift-Eintrag

---

## Test 1: Grundansicht & Layout

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 1.1 | Öffne den Kalender-Screen | Monatsgrid mit 7 Spalten (Mo–So), 6 Wochen-Zeilen sichtbar |  |
| 1.2 | Header zeigt aktuellen Monat + Jahr | z.B. "Februar 2026" |  |
| 1.3 | Wochentag-Header sichtbar | "Mo Di Mi Do Fr Sa So" über dem Grid |  |
| 1.4 | Heutiger Tag ist blau umrandet | Blauer 2px Rahmen + fette blaue Zahl |  |
| 1.5 | Tage außerhalb des aktuellen Monats sind blass | opacity: 0.25 |  |

---

## Test 2: Shift-Farben

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 2.1 | Tage mit Schichtplan haben farbigen Hintergrund | F=gelb, S=blau, N=violett, etc. |  |
| 2.2 | Schichtcode-Buchstabe unter der Tageszahl | z.B. "F", "S", "N" klein unter der Zahl |  |
| 2.3 | Tage ohne Plan haben keinen farbigen Hintergrund | Standard-Zellfarbe |  |
| 2.4 | Alle 8 Codes (F,S,N,T,K,R,U,X) werden korrekt dargestellt | Farben stimmen mit setup.tsx/SHIFT_META überein |  |

---

## Test 3: Swipe Monats-Navigation

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 3.1 | Swipe nach links | Nächster Monat wird angezeigt, Header aktualisiert |  |
| 3.2 | Swipe nach rechts | Vorheriger Monat wird angezeigt, Header aktualisiert |  |
| 3.3 | Snapping/Paging funktioniert | Grid snappt exakt auf eine Monatsseite, kein halbes Scrollen |  |
| 3.4 | Mehrfach schnell swipen | Kein Crash, Header bleibt synchron |  |
| 3.5 | Links-Pfeil (‹) tippen | Springt zum Vormonat, animiert |  |
| 3.6 | Rechts-Pfeil (›) tippen | Springt zum Nächsten Monat, animiert |  |
| 3.7 | Am Rand (±12 Monate): Pfeile funktionieren noch | Stoppt am Ende/Anfang, kein Crash |  |

---

## Test 4: "Heute" Button

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 4.1 | Swipe zu einem anderen Monat | "Heute"-Button erscheint |  |
| 4.2 | Tippe "Heute" | Kalender springt zurück zum aktuellen Monat |  |
| 4.3 | Im aktuellen Monat: "Heute"-Button | Button ist nicht sichtbar (korrekt ausgeblendet) |  |
| 4.4 | Tippe auf den Monatsnamen im Header | Springt auch zu "Heute" (gleiche Funktionalität) |  |

---

## Test 5: Tageszellen-Interaktion

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 5.1 | Tippe auf einen Tag im aktuellen Monat | Navigiert zu Swap-Kandidaten für dieses Datum |  |
| 5.2 | Tippe auf einen blassen Tag (außerhalb Monat) | Keine Navigation (inMonth = false) |  |

---

## Test 6: Ghost-Anzeige

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 6.1 | Tag mit Ghost-Eintrag: violetter Punkt sichtbar | Kleiner Punkt unten-rechts in der Zelle |  |
| 6.2 | Unterhalb des Monatsgrids: Ghost-Legende | "Ghosts in diesem Monat" mit Tag + Code + Label |  |
| 6.3 | Monat ohne Ghost-Einträge | Keine Ghost-Legende sichtbar |  |

---

## Test 7: Performance

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 7.1 | Initiales Laden des Kalenders | Schnell (< 2s), kein Stutter |  |
| 7.2 | Swipe zwischen Monaten | Flüssig, kein Ruckeln |  |
| 7.3 | 10x schnell hin-und-her swipen | Kein Crash, kein Memory-Leak |  |
| 7.4 | App mit großem Schichtplan (52 Wochen) | Kalender lädt und swipt flüssig |  |

---

## Test 8: Empty State

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 8.1 | Kalender ohne Schichtplan öffnen | Zeigt Empty-State mit "Muster einrichten" Button |  |
| 8.2 | "Muster einrichten" tippen | Navigiert zum Setup-Screen |  |

---

## Test 9: Bottom Buttons

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 9.1 | "Muster bearbeiten" Button | Navigiert zum Setup-Screen |  |
| 9.2 | "Zurück zu Spaces" Button | Navigiert zurück zur Space-Liste |  |

---

## Test 10: Persistenz

| # | Schritt | Erwartetes Ergebnis | OK |
|---|---------|--------------------|----|
| 10.1 | App schließen und neu starten | Kalender zeigt gleiche Schichtdaten |  |
| 10.2 | Schichtplan ändern → Kalender öffnen | Neue Daten sichtbar |  |

---

## Ergebnis

| Kategorie | Bestanden | Fehlgeschlagen | Offen |
|-----------|-----------|----------------|-------|
| Grundansicht | /5 | | |
| Shift-Farben | /4 | | |
| Swipe-Navigation | /7 | | |
| Heute-Button | /4 | | |
| Interaktion | /2 | | |
| Ghost-Anzeige | /3 | | |
| Performance | /4 | | |
| Empty State | /2 | | |
| Bottom Buttons | /2 | | |
| Persistenz | /2 | | |
| **Gesamt** | **/35** | | |

---

*Erstellt für Iteration 8.5 – Swipeable Monatskalender*
