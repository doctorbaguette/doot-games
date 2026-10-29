# Birthday Gameshow 2027 – Board-Prototyp

Für den speicherbaren Board-Editor mit sechs Kategorien und je fünf Feldern siehe
[birthday-board-editor.md](./birthday-board-editor.md). Der folgende Prototyp bleibt
weiterhin ohne gespeicherte Konfiguration verfügbar.

Der Prototyp ist unter **`/host/birthday`** erreichbar und verwendet die bestehende
`SessionHostRoom` mit genau einer `RoomRuntime`. Es gibt weder eine zweite
Spielerregistrierung noch eine neue Datenbankstruktur oder einen Board-Editor.

## Mit vier Testspielern ausprobieren

1. Im Repository in PowerShell starten:

   ```powershell
   pnpm.cmd dev --host 0.0.0.0
   ```

2. Am Host-PC `http://localhost:3000/host/birthday` öffnen. Falls der Devserver
   einen anderen Port meldet, diesen verwenden. Oben steht der Raumcode.
3. Vier weitere Browserfenster/-tabs oder Smartphones als Spieler anmelden:
   `http://localhost:3000/play/RAUMCODE` am selben PC; am Smartphone im selben WLAN
   die Netzwerkadresse des PCs statt `localhost`, z. B.
   `http://192.168.1.20:3000/play/RAUMCODE`. Vier unterschiedliche Namen verwenden.
   Alle sollten vor dem ersten Feld auf dem Board ankommen.
4. Am Host ein beliebiges freies Feld über **Feld starten** auswählen:
   - **BRAINS:** Die Spieler wählen eine der vier Antworten und drücken
     **Lock it in**. Der Host sperrt bei Bedarf mit **Lock voting**, wählt
     **Reveal** und anschließend **Final results**.
   - **DRAW:** Der Host drückt **Collect answers**. Alle zeichnen am Smartphone
     und drücken **Lock it in**. Nach dem Sperren führt **Start the vote →** zur
     Abstimmung. **Open voting** öffnet die Galerie. Jeder wählt eine fremde
     Zeichnung und bestätigt mit **Lock it in**. Danach **Reveal** und
     **Final results** am Host.
   - **VERSUS:** **Turnier erstellen** lost die vier Spieler aus. Die beiden
     jeweils nicht beteiligten Spieler können tippen. **Duell starten** sperrt
     die Tipps. Extern Nidhogg spielen, Sieger auswählen und Ergebnis bestätigen.
     Zwei Halbfinals und Finale durchspielen; ausgeschiedene Spieler dürfen
     weiterhin wetten. Nach dem Finale **Turnier abschließen**, dann
     **Final results** drücken.
5. Nach jedem Ergebnis **Zurück zum Board · Feld abschließen** drücken. Erst
   dieser Schritt markiert das Feld als abgeschlossen und übernimmt seine
   Platzierungspunkte. Die Smartphones zeigen ebenfalls wieder das Board.
6. Die übrigen Felder in beliebiger Reihenfolge spielen. Bereits gespielte Felder
   sind gesperrt. Nach drei Feldern zeigt das Board die abgeschlossene Gameshow.

Der Host selbst zählt nur als Spieler, wenn er zusätzlich über die Spieleransicht
mit einem eigenen Namen beigetreten ist. Der Prototyp bietet bewusst kein
Wiederholen abgeschlossener Felder. Für einen neuen Testabend kann die Host-Seite
in einem frischen Browserkontext geöffnet werden; dieser erhält einen neuen Raum.

## Wertung

Die Spielpunkte der bestehenden Spiele bleiben unverändert: zum Beispiel 1000
pro gewonnenem Turniermatch und 300 pro richtigem Zuschauertipp. Für das Board
gilt weiterhin **Doots bisherige Session-Regel**: 5/3/2/1 Platzierungspunkte je
Feld, nur für Spieler mit positiven Spielpunkten. Auch Gleichstände werden genau
wie bisher behandelt. Die Regel wird von linearen Sessions und Board gemeinsam
verwendet. Es gibt keine neue Gesamtpunkteformel.

## Adapter und Zustände

External Challenge besitzt aktuell **keine** eigene `components.Host`-Ansicht.
Sie ist ein `solo`-Block im generischen `GameHost`. Der Adapter verwendet genau
diesen bestehenden Plugin-Einstieg; Turnierlogik und Wettablauf wurden für den
Board-Modus nicht umgebaut.

- `birthdayBoardGames.ts`: die drei festen Spielkonfigurationen; die Quizfrage
  wird vor Veröffentlichung durch den bestehenden Redaktionsweg bereinigt.
- `birthdayBoard.ts`: aktives Feld, eindeutige Ausführungs-ID, abgeschlossene
  Felder und deren Session-Beiträge. Wiederholte Abschlussaktionen zählen nicht
  doppelt. Der öffentliche Zustand enthält keine Quizantworten.
- `sessionGameAdapter.ts` / `SessionGameSurface.vue`: Laden im bestehenden Raum,
  Rendern mit `sessionMode` und Spielkanäle unter `session-runs/<runId>/…`.
  Die Spielkomponenten sehen weiterhin ihre bisherigen Kanalnamen. Beim Verlassen
  werden Abonnements beendet und vom Host beobachtete Spielkanäle mit `null`
  bereinigt. Andere Ausführungen und der öffentliche Board-Kanal bleiben erhalten.
- `SessionHostRoom.client.vue`: besitzt weiterhin die einzige Host-Rauminstanz.
  `BirthdayBoardSession.vue` steuert nur Auswahl und Ablauf auf dieser Instanz.
- Die Engine trägt die Ausführungs-ID optional in den Metadaten. Bei einem neuen
  Board-Spiel wird die spielbezogene Teilnahmeberechtigung vorhandener Gäste auf
  Runde 0 zurückgesetzt, ohne deren Identität oder Registrierung auszutauschen.

Vollständig eigene Host-Plugins bleiben im generischen Adapter gesperrt. Falls
ein solches Spiel später hinzukommt, benötigt es einen ausdrücklich geprüften
Adapter für Abschluss und Zustand; der Prototyp behauptet keine allgemeine
Unterstützung beliebiger Custom-Host-Spiele.

## Refresh und Grenzen

Markierungen und Session-Beiträge liegen im `sessionStorage` der bestehenden
Host-Registerkarte. Smartphones lesen den öffentlichen Board-Zustand über das
vorhandene Relay. Ein Refresh auf dem Board erhält die abgeschlossenen Felder.
Die vorbereiteten drei Felder liegen fest im Code; es gibt keine dauerhafte
Board-Speicherung im Benutzerkonto.

BRAINS und VERSUS können innerhalb der vorhandenen Doot-Wiederaufnahmegrenzen
fortgesetzt werden, einschließlich des Turnierbaums und angenommener Wetten.
DRAW erzeugt eine geheime Laufzeit-Zuordnung für die Abstimmung und ist nach einem
Host-Refresh nicht vollständig wiederherstellbar. Der Host bekommt dafür einen
expliziten Neustartknopf für das unvollständige Feld; abgeschlossene Felder und
ihre Punkte bleiben erhalten. Der Neustart erhält eine neue Ausführungs-ID.

Es gelten weiterhin die bestehende Host-Identität, das Wiederaufnahmefenster von
90 Sekunden seit dem letzten Host-Signal, die Relay-Aufbewahrung und die bisherigen
Grenzen der öffentlichen Relay-Authentifizierung. Ein geschlossenes Browserprofil
ist kein dauerhaftes Archiv des Spielabends.

## Prüfungen

```powershell
pnpm.cmd typecheck
pnpm.cmd test packages/engine packages/games apps/web/app/utils
```

Ein optionaler echter Browser-Test spielt mit vier simulierten Smartphones alle
drei Felder einschließlich Zuschauerwetten durch. Er benötigt einen laufenden
Devserver, Netzwerkzugriff auf das konfigurierte Relay und Microsoft Edge:

```powershell
# Erstes Terminal:
pnpm.cmd dev --host 127.0.0.1 --port 3107

# Zweites Terminal:
$env:DOOT_BOARD_E2E = '1'
pnpm.cmd test apps/web/app/utils/birthdayBoard.browser.test.ts
```

`DOOT_BOARD_URL` kann bei Bedarf auf eine andere lokale Devserver-Adresse gesetzt
werden. Der Test startet Edge unsichtbar und erstellt nur temporäre Testräume.
