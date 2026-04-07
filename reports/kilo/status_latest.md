# YASA Status - Companion + Stempeluhr (Latest)

**Datum:** 2026-03-23  
**Status:** Ready for Implementation  
**Quelle:** User-validierte Produktausrichtung

## Produktfokus (verbindlich)
YASA ist nicht nur ein Schicht-Tool, sondern ein Alltagsbegleiter:
- unterstützt, entlastet und motiviert im Arbeitsalltag
- generiert aus freiwillig bereitgestellten User-Daten konkrete Mehrwerte
- liefert proaktive Hinweise statt nur statischer Verwaltung

## Companion Feature-Backlog (validiert)
1. Frei-Countdown
2. Urlaubs-Countdown
3. Feiertagsbonus-Hinweis (zusätzliche Stunden/Urlaubstage)
4. Woche-geschafft-Summary
5. Belastungsampel
6. Erholungsfenster-Reminder
7. Urlaubsstrategie-Vorschlag
8. Swap-Chancen-Insight
9. Zeitkonto-Prognose
10. Mikro-Motivation vor schweren Diensten
11. Team-Resonanz-Hinweise
12. Monatsrückblick mit Wins

## Sofort-Fokus: Virtuelle Stempeluhr

### Ziel
Den realen Zeitkonto-Stand präziser machen durch einfache, schnelle Erfassung von Kommen/Gehen direkt in YASA.

### Kernanforderungen (validiert)
- Beim App-Öffnen wird ein Stempel-Popup nur dann eingeblendet, wenn der User zeitlich im Bereich eines hinterlegten Regeldienstes liegt.
- Button-Beschriftung ist kontextabhängig:
  - `Kommen` (Einstempeln)
  - `Gehen` (Ausstempeln)
- Beim Tap wird aktuelle Uhrzeit als Zeitstempel gespeichert.

### Betroffene Regeldienste
- `F` (Früh)
- `S` (Spät)
- `N` (Nacht)
- `KS` (Kurze Spät)
- `KN` (Kurze Nacht)
- `T` (Tagesdienst)

### Konfigurierbarkeit pro User
- Für jeden Regeldienst:
  - Startzeit
  - Endzeit
- Gleitzeit:
  - ob bezahlt (ja/nein)
  - Minutenwert (z. B. 15)

### Zeitfenster-Logik Popup
- Popup wird rund um Dienstbeginn/-ende verfügbar.
- Beispiel Nacht:
  - Dienst: `22:00-06:00`
  - Gleitzeit: `15 min`
  - Popup verfügbar ab `21:45`
  - Popup mindestens bis `06:15`
  - optionaler Kulanzpuffer bis `06:30` (validierter Use Case)

### Hinweise zur Logik
- Nacht-/Kurznacht-Dienste gehen über Mitternacht -> Datumswechsel sauber behandeln.
- Popup nur für relevante aktuelle/nahe Schicht anzeigen (kein Spam).
- Stempelereignisse revisionssicher speichern (timestamp + type + source).

## Nächste Umsetzungsschritte
1. Datenmodell für Dienstzeiten + Gleitzeit pro User einführen.
2. Stempelereignis-Modell (`check_in`, `check_out`) einführen.
3. Popup-Trigger-Engine für Fensterlogik implementieren.
4. UI-Komponente `StempeluhrPopup` mit `Kommen/Gehen`.
5. Integration mit Zeitkonto-Prognose.

## Akzeptanzkriterien (MVP)
- User kann Dienstzeiten/Gleitzeit konfigurieren.
- Popup erscheint nur im gültigen Zeitfenster.
- Tap auf `Kommen`/`Gehen` speichert korrekten Timestamp.
- Nacht-Dienst-Beispiel (`22:00-06:00`, Gleitzeit 15) funktioniert inkl. Kulanz bis `06:30`.
- Zeitkonto nutzt Stempelwerte als Datenquelle.

## Update 2026-03-24 (QA verifiziert)
1. Zentrale `timeAccountEngine` eingeführt und an zwei Screens angebunden:
- `Services > Stempeluhr`
- `Services > Urlaubs- & Freizeitkonto`
2. Intervallbasierte Tariflogik aktiv:
- Vorfest/Feiertag werden aus echten Stempelintervallen minutengenau gesplittet.
- Overnight-Fall wird korrekt behandelt.
3. Gleitzeit-Regel aktiv:
- `credit = min(paidFlexMinutes, early + late)`
4. Manuelle Verifikation PASS:
- `Feiertag / Vorfest = 6,02 / 2,25`
- `Gleitzeit angerechnet (Regel) = 0,25`
- Run-Doku: `docs/qa/timeclock_run_2026-03-24.md`
5. QA-Override fuer Feiertag/Vorfest bleibt temporaer aktiv bis Brueckentage/Strategie integriert ist.
