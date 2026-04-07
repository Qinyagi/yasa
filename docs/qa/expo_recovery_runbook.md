# Expo Recovery Runbook (Quick)

## Ziel
Schnelle Wiederherstellung, wenn Expo/Metro bei Deep-Link- oder QA-Tests haengt.

## Standard-Reset (Windows PowerShell)
1. Im Projektordner `c:\Users\XyZ\Documents\YASA\yasa` alle laufenden Expo-Prozesse mit `Ctrl + C` stoppen.
2. Cache-Clean-Start:
```powershell
npx expo start -c
```
3. Falls weiterhin Probleme:
```powershell
rmdir /s /q .expo
rmdir /s /q node_modules\.cache
npx expo start -c
```

## Netzwerk-Check
1. Handy und Dev-Maschine im selben WLAN.
2. In Expo-UI auf `LAN` stellen (nicht Tunnel), wenn moeglich.
3. Deep-Link immer mit `.../--/<route>` verwenden.

## Deep-Link-Format
Basis:
`exp://<IP>:<PORT>/--/<route>`

Beispiel:
`exp://192.168.178.41:8082/--/(team)/today`

## If Still Broken
1. Expo Go auf dem Handy komplett beenden und neu starten.
2. QR erneut scannen.
3. Erst danach Deep-Link erneut oeffnen.

