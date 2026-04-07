# YASA Time Data Ownership Sheet (SSOT)

**Stand:** 2026-03-24  
**Ziel:** Klare Datenhoheit, keine unnötige Duplikation, sauberes Fundament für Zeitkonto + spätere Voice-Infoabfragen.

## Prinzipien
1. Eine Information hat genau **eine** fachliche Heimat (Single Source of Truth).
2. Andere Screens zeigen diese Information nur an oder berechnen daraus abgeleitete Werte.
3. Rohdaten und Berechnungen sind getrennt: Rohdaten schreiben, Ergebnisse lesen.
4. Keine Monetärlogik in dieser Phase. Nur Stunden/Tage/Ansprüche.

## Ownership Matrix
| Datenbereich | SSOT Speicher | Pflege durch | Primäre UI | Nur abgeleitet in |
|---|---|---|---|---|
| Space-Tarifregeln (Feiertag, Vorfest, Zulagen-Regeln in Stunden) | `TIME_ACCOUNT_SPACE_RULES` | Space Owner/Admin | `Admin > Space-Regelprofil` | Urlaubs- & Freizeitkonto, Stempeluhr, Voice-Infos |
| Persönliche Kontobasis (Urlaubstage, individuelle Startwerte) | `TIME_ACCOUNT_USER` | User (ggf. teilweise Admin-gesetzt) | `Services > Urlaubs- & Freizeitkonto` | Monatskonto, Voice-Infos |
| Schichtplan (Soll-Dienststruktur) | `SHIFTS` | User | Setup/Schichtplan/Kalender | Sollstunden-Rechner |
| Stempelereignisse (Kommen/Gehen Rohdaten) | `TIMECLOCK_EVENTS` | User (Popup + Stempeluhr + Edit) | `Services > Stempeluhr` | Iststunden-Rechner |
| Stempeluhr-Konfiguration (Dienstfenster, Gleitzeitfenster) | `TIMECLOCK_CONFIG` | User | `Services > Stempeluhr` | Popup-Logik, Validierung |
| UI-Status (z. B. Collapsible offen/zu) | `TIMECLOCK_UI` | App intern | jeweiliger Screen | nirgends fachlich |

## Was wo **nicht** hin gehört
1. Keine Tarif-Stammdaten in `TIMECLOCK_CONFIG`.
2. Keine dauerhafte Kontobilanz als harte Speicherung in UI-Screens.
3. Keine doppelte Pflege derselben Regel in `Space-Regelprofil` und `Urlaubs- & Freizeitkonto`.
4. Keine Copy-Paste-Berechnungslogik pro Screen.

## Berechnungs-Layer (zentral)
Ein zentraler Domain-Layer berechnet:
1. `Sollstunden` (aus Schichtplan + Space-Regeln).
2. `Iststunden` (aus Stempelereignissen, validierten Paaren).
3. `Delta/Gleitzeit` (Ist - Soll).
4. `Tarif-Zeitgutschriften` (Feiertag/Vorfest/Zulagen in Stunden).
5. `Freizeitansprüche` (Tage/Stunden, ohne Geld).

Alle Screens konsumieren diese Ergebnisse:
1. Stempeluhr (`Monatskonto`, Tagesbilanz).
2. Urlaubs- & Freizeitkonto (Kontostand, Verlauf).
3. Startscreen-Popups (Motivation/Hinweise).
4. Später Voice-Info-Popup.

## Voice-Readiness (für spätere Ausbaustufe)
Voice darf nur gegen fertige Queries arbeiten:
1. `Wie stehe ich heute?`
2. `Wie viel Soll/Ist/Delta habe ich diesen Monat?`
3. `Welche Freizeitansprüche habe ich aktuell?`

Antwortpfad:
1. Voice Intent -> Domain Query
2. Domain Query -> zentral berechnetes Ergebnis
3. Ergebnis -> Info-Popup (später optional zusätzlich TTS)

## Konkrete nächste Schritte
1. Domain-Modul `timeAccountEngine` einführen (ohne UI-Code).
2. `Monatskonto` in Stempeluhr auf Engine-Ergebnis umstellen.
3. `Urlaubs- & Freizeitkonto` auf dieselbe Engine anbinden.
4. Tarifgutschriften aus `Space-Regelprofil` in Stundenlogik integrieren.
5. Einheitliches `Explanation Log` je Ergebnis (warum + wie berechnet).

## Entscheidungskriterium für neue Felder
Vor jedem neuen Feld beantworten:
1. Gehört es dem Space (global) oder dem User (individuell)?
2. Ist es Rohdaten-Eingabe oder ein berechnetes Ergebnis?
3. Muss es gespeichert werden oder kann es zur Laufzeit berechnet werden?
4. Welcher Screen ist Eigentümer der Pflege?

Wenn diese 4 Punkte nicht klar sind, wird das Feld nicht eingebaut.

