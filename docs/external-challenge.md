# External Challenge: VERSUS-Turnier

Der Host erstellt aus allen gerade anwesenden **Spielern** einen festen K.-o.-Baum.
Host und Zuschauer zählen nur mit, wenn sie zusätzlich als Spieler angemeldet sind.
Mindestens zwei Spieler und eine gerade Anzahl sind erforderlich. Freilose werden
unter allen Teilnehmern zufällig verteilt. Die Teilnehmerliste und Auslosung ändern
sich danach auch bei neuen oder getrennten Smartphone-Verbindungen nicht.

## Lokal ausprobieren

1. Im Repository in PowerShell `pnpm.cmd dev --host 0.0.0.0` starten.
2. Am PC `http://localhost:3000/host/external-challenge` öffnen (bzw. den vom
   Devserver angezeigten Port). Alternativ im Katalog „External Challenge“ hosten.
3. Zwei Spieler mit unterschiedlichen Namen anmelden. Auf dem PC gehen getrennte
   Browserfenster oder Tabs; auf Smartphones im selben WLAN die vom Devserver
   angezeigte Netzwerkadresse öffnen, zum Beispiel `http://192.168.1.20:3000/join`.
   Den Raumcode vom Host verwenden. Ein QR-Code mit `localhost` funktioniert auf
   einem Smartphone nicht; gegebenenfalls die Netzwerkadresse manuell öffnen.
4. Das Spiel starten, dann **Turnier erstellen** drücken. Bei zwei Spielern ist
   das einzige Duell bereits das Finale.
5. **Duell starten**, extern spielen, Sieger auswählen, **Ergebnis bestätigen**.
   Erst eine Bestätigung überträgt den Sieger in die nächste Runde.
6. Während des Turniers Host oder Smartphone aktualisieren: Paarungen, laufendes
   Match und bestätigte Ergebnisse bleiben erhalten. Dieselbe Host-Registerkarte
   verwenden, damit Doot seine vorhandene Host-Identität wiedererkennt.
7. Nach dem Finale erscheint der Champion. **Turnier abschließen** sperrt die
   Ergebnisse; danach führt **Final results** zur normalen Doot-Spielwertung.

Mit vier Spielern lässt sich der Rundenwechsel testen. Mit sechs oder zehn
Spielern sind Freilose sichtbar. Mit drei Spielern muss eine verständliche
Fehlermeldung erscheinen, ohne dass ein Baum erstellt wird.

## Korrektur und Punkte

Solange das Turnier noch nicht ausdrücklich abgeschlossen wurde, kann der Host
unter **Ergebnis korrigieren** einen anderen Sieger auswählen. Bereits gestartete
oder beendete Folgematches erfordern eine zusätzliche Bestätigung: Nur die vom
geänderten Ergebnis abhängigen Matches werden zurückgesetzt. Unabhängige
Ergebnisse und die Auslosung bleiben erhalten. Die Spielpunkte werden aus den
verbleibenden bestätigten Ergebnissen neu berechnet.

**Turnier zurücksetzen** verlangt ebenfalls eine Sicherheitsbestätigung und
entfernt Baum und Turnierpunkte. Anschließend kann mit der aktuellen Lobby neu
ausgelost werden. Abbrechen verändert nichts.

Jeder tatsächlich ausgespielte Sieg gibt 1000 Spielpunkte, eine Niederlage 0.
Freilose und der Turniersieg selbst geben keinen Bonus. Die normale Doot-Wertung
addiert diese Punkte auch bei mehreren External-Challenge-Runden. Die bestehende
Session-Wertung bleibt unverändert: Platzierungen der Spieler mit positiven
Spielpunkten bringen 5/3/2/1 Session-Punkte; Spielpunkte werden dort nicht addiert.

## Architektur und Grenzen der Wiederherstellung

- `tournament.ts`: reine Auslosung, Zustandsübergänge, Abhängigkeiten, Validierung
  und Punkteberechnung mit `scoreExternalDuel`.
- `TournamentBracket.vue`: gemeinsame Darstellung auf Host und Smartphone.
- `ChallengeHost.vue`: ausschließlich Hostaktionen, einschließlich Sicherheitsabfragen.
- `ChallengePlayer.vue`: synchronisierte Paarungen und Spielpunkte ohne Ergebnisaktionen.
- Der Zustand liegt als öffentlicher Rundeninhalt im vorhandenen Doot-Relay.
  Eingaben von Spielern entscheiden keine Turnierergebnisse. Hostaktionen prüfen
  die Rolle über Doots vorhandene Mechanismen. Das ist keine neue serverseitige
  Authentifizierung für das öffentliche Relay.
- Die Engine stellt öffentliche Rundeninhalte und die fertige Ergebnisübersicht
  bei einer erlaubten Host-Wiederaufnahme wieder her. Es gelten weiterhin Doots
  Host-Identität, Wiederaufnahmefenster (90 Sekunden seit letztem Host-Signal)
  und die begrenzte Relay-Aufbewahrung. Dies ist kein dauerhaft gespeichertes
  Turnierarchiv. Die Session-Oberfläche hält Spielauswahl, Spielindex und bestehende
  Platzierungspunkte zusätzlich im `sessionStorage` derselben Host-Registerkarte,
  damit ein Refresh den Turnierablauf nicht vom laufenden Spiel trennt. Der Marker
  bereits gewerteter Spiele verhindert doppelte Session-Platzierungspunkte.

## Automatisierte Checks

```powershell
pnpm.cmd typecheck
pnpm.cmd test packages/games/src/blocks/external-challenge packages/engine/src/room.test.ts packages/games/src/catalog.test.ts packages/games/src/runtime/derive.test.ts
```

Die Tests prüfen Turniere mit 2 bis 32 Teilnehmern, Freilose ohne Punkte,
Rundenreihenfolge, gesperrte Mehrfachbestätigungen, Korrekturen samt abhängigen
Matches, Einbindung in `scoreGame`, Hostrollen und Wiederherstellung über das Relay.
