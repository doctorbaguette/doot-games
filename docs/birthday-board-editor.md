# Birthday Gameshow – Board-Editor und Speicherung

## Erstellen und speichern

1. Doot lokal starten: `pnpm.cmd dev --host 0.0.0.0`.
2. Am Host-PC `http://localhost:3000/login` öffnen und mit deinem vorhandenen
   Doot-Konto anmelden oder dort ein Konto registrieren. Den vom Devserver
   angezeigten Port verwenden, falls er von 3000 abweicht.
3. `http://localhost:3000/boards/new` öffnen. Alternativ unter **Meine Gameshows &
   Playlists** (`/playlists`) auf **Gameshow-Board erstellen** klicken.
4. Den Gameshow-Namen und die Kategorien bearbeiten. Vorgabe sind sechs Kategorien
   mit je fünf Feldern. Jedes Feld hat eine Beschriftung, einen ganzzahligen Wert
   und einen Spieltyp. **Kategorie/Feld nach oben/unten** verändert die Reihenfolge,
   ohne die Identität oder Zuordnung des Feldes zu verlieren.
5. Einen der drei unterstützten Spieltypen auswählen:
   - **BRAINS:** die einzelne vorbereitete Multiple-Choice-Frage.
   - **DRAW:** die vorbereitete Zeichenaufgabe mit anschließender Abstimmung.
   - **VERSUS:** das vollständige Nidhogg-Turnier inklusive Auslosung, Turnierbaum,
     Zuschauerwetten und Spielpunkten.
6. **Board speichern** drücken. Beim ersten Speichern erhält das Board eine eigene
   Adresse wie `/boards/pl_…`. Danach speichert derselbe Knopf Änderungen an genau
   dieser Vorlage. Kategorien und Felder können bei Bedarf ergänzt werden; die
   Grenzen sind zwölf Kategorien und zehn Felder pro Kategorie.

Die Feldwerte werden auf dem Board angezeigt. Sie sind **noch keine neue
Punkteformel**: Die bestehende Session-Platzierungswertung bleibt 5/3/2/1 Punkte
pro Spiel für Spieler mit positiven Spielpunkten. Turnier-Siegpunkte und Wettboni
bleiben innerhalb von External Challenge unverändert.

Eigene Quizfragen, Bildzuordnungen und gespeicherte Custom Games sind in dieser
Phase noch nicht auswählbar. Die Datenstruktur hat dafür ein versioniertes,
typisiertes Spielziel pro Feld. Unbekannte Ziele und zusätzliche unvalidierte
Spielinhalte werden beim Speichern abgewiesen.

## Später wieder öffnen

Nach einem Browser- oder PC-Neustart denselben lokalen Doot-Server mit derselben
Datenbank starten, anmelden und `/playlists` öffnen. Dein Board erscheint mit der
Anzahl seiner Felder. **Board bearbeiten** öffnet den Editor, **Host** die Show.
Du kannst auch die gespeicherte Editor-Adresse direkt wieder öffnen.

Die Vorlage liegt dauerhaft in der bestehenden SQLite-Datenbank, nicht nur im
Browser. Ohne `DATABASE_URL` ist das Doots normale `.data/doot.sqlite` relativ zum
Server-Arbeitsverzeichnis, beim üblichen pnpm-Start also unter `apps/web/.data`.
Die bestehende Playlist-Tabelle bekommt automatisch eine optionale Spalte
`board_config`. Die Migration fügt nur diese Spalte hinzu; sie löscht keine
Datenbank, Tabelle oder vorhandene Playlist. Normale lineare Playlists bleiben
nutzbar. Bestehende Doot-Benutzerkonten und Zugriffsprüfungen werden weiterverwendet.

## Eine Show starten und währenddessen bearbeiten

Nach dem Speichern **Gameshow öffnen** wählen. Die Show läuft wie bisher in einem
einzigen Raum. Alle Gäste treten einmal über `/play/RAUMCODE` bei und bleiben beim
Wechsel zwischen Board, Quiz, Zeichnen und Turnier in dieser Lobby. Smartphones
verwenden im selben WLAN die Netzwerkadresse des PCs statt `localhost`.

Beim ersten Öffnen wird eine feste Kopie der gespeicherten Board-Konfiguration
für den Abend erstellt. Kategorien, Reihenfolge, Beschriftungen, Werte und
Spielzuordnungen werden aus dieser Kopie gelesen. Bearbeitest du die Vorlage
anschließend in einem anderen Tab, verändert das die laufende Show auch nach
einem Host-Refresh nicht.

**Gameshow öffnen** setzt in derselben Host-Registerkarte gegebenenfalls die
bereits begonnene Show fort. Soll ausdrücklich der inzwischen geänderte
Speicherstand verwendet werden, zwischen den Spielen **Neue Gameshow starten**
wählen und die Sicherheitsabfrage bestätigen. Das erzeugt einen neuen Raumcode
und einen neuen Fortschritt ohne alte Session-Punkte. Die Vorlage bleibt
gespeichert; Gäste müssen dem neuen Raum beitreten.

Die dauerhafte Vorlage und der laufende Fortschritt sind getrennt. Fortschritt
und die private Abend-Kopie liegen weiterhin im `sessionStorage` des Host-Tabs;
das ist kein dauerhaftes Archiv eines begonnenen Abends. Für laufende Spiele
gelten die bisherigen Wiederaufnahmegrenzen. DRAW kann nach einem Host-Refresh
einen Neustart des unvollständigen Feldes benötigen. Die gespeicherte Vorlage
geht dadurch nicht verloren.

## Private und öffentliche Daten

Gespeicherte Boards sind in dieser Version privat und nur für ihr Eigentümer-Konto
les- und bearbeitbar. Sie werden nicht in öffentlichen Playlist-Listen angeboten.
Die Smartphones erhalten nur eine ausdrücklich zusammengestellte Ansicht mit
Titel, Kategorien, Feldbeschriftungen, Werten und Spielstatus. Private Spielziele
oder künftige geschützte Inhalte werden nicht einfach mitgesendet. Beim gewählten
Quiz greift zusätzlich weiterhin Doots bestehende Antwort-Redaktion bis zur
Auflösung. Die bekannten Grenzen der öffentlichen Relay-Authentifizierung gelten
unverändert für den Live-Spielbetrieb.

Der Drei-Felder-Prototyp unter `/host/birthday` bleibt ohne gespeicherte Vorlage
und ohne Konto spielbar. Seine Klickwege stehen in `birthday-board-prototype.md`.

## Technische Prüfungen

```powershell
pnpm.cmd typecheck
pnpm.cmd test
```

Die SQLite-Tests starten mit einer alten Playlist-Tabelle, führen die additive
Migration mehrfach aus und prüfen Speichern und erneutes Öffnen einer separaten
temporären Dateidatenbank. Weitere Tests prüfen Eigentümerschutz, öffentliche
Projektion, unterstützte Ziele, Reihenfolge, Session-Wertung und unveränderliche
Abend-Kopien.

Der optionale `savedBoard.browser.test.ts` prüft Editor, echte Doot-Anmeldung,
erneutes Anmelden, Zugriffsschutz und die Trennung zwischen einer bearbeiteten
Vorlage und laufender Show. Dafür einen Devserver mit eigener temporärer
`DATABASE_URL` und passender `PUBLIC_BASE_URL` starten; der Test erstellt eigene
Testkonten. Anschließend:

```powershell
$env:DOOT_SAVED_BOARD_E2E = '1'
pnpm.cmd test apps/web/app/utils/savedBoard.browser.test.ts
```

Standardmäßig verwendet er `http://127.0.0.1:3107`, bei Bedarf über
`DOOT_BOARD_URL` überschreibbar, sowie Microsoft Edge im unsichtbaren Modus.
