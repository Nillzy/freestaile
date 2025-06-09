# FreestAIle - Multiplayer-Modus

Diese Komponente implementiert eine Multiplayer-Funktionalität für die FreestAIle Power-Point-Karaoke-Anwendung mit Echtzeit-Chat.

## Installation

Die Multiplayer-Komponente ist in der Hauptanwendung integriert. Zur Installation müssen lediglich die erforderlichen Abhängigkeiten installiert werden:

```bash
npm install socket.io qrcode uuid
```

## Starten der Anwendung

Starte die Anwendung mit:

```bash
npm run dev
```

Der Server läuft dann unter http://localhost:8080

## Architektur

Die Multiplayer-Komponente besteht aus folgenden Hauptbestandteilen:

1. **Server-Komponente** (`multiplayer/server/index.js`):

   - Socket.io-Server für die Echtzeit-Kommunikation
   - Verwaltet Lobbys, Spieler und Chat-Nachrichten im Speicher
   - Implementiert Socket.io-Events (createLobby, joinLobby, startPresentation, chatMessage)

2. **Express-Routen** (`multiplayer/server/routes.js`):

   - Stellt URLs für Lobby-Erstellung, Beitritt und Präsentation bereit
   - Rendert die Eta-Templates mit den erforderlichen Daten

3. **Client-Komponente** (`multiplayer/client/socket-client.js`):

   - JavaScript-Klasse, die Socket.io-Client-Funktionalitäten kapselt
   - Stellt Methoden für Lobby-Erstellung, Beitritt und Chat bereit
   - Event-System für UI-Updates

4. **Eta-Templates**:
   - `lobby.eta`: Lobby-Seite für Host und Clients
   - `join.eta`: Beitrittsseite für Client-Spieler
   - `multiplayer-presentation.eta`: Präsentations- und Chat-Seite

## Socket.io-Events

- `createLobby`: Erstellt eine neue Lobby und generiert QR-Code/Join-URL
- `joinLobby`: Ermöglicht Clients den Beitritt zu einer Lobby
- `startPresentation`: Startet die Präsentation und leitet alle Teilnehmer weiter
- `chatMessage`: Sendet Chat-Nachrichten an alle Teilnehmer
- `playerJoined`, `playerLeft`: Informiert Teilnehmer über Änderungen bei den Spielern
- `lobbyEnded`: Signalisiert das Ende einer Lobby (z.B. wenn der Host die Verbindung trennt)

## Rollen

- **Host**: Erstellt die Lobby, steuert den Spielstart, sieht den Chat nur im Lesemodus
- **Client**: Tritt per QR-Code/URL bei, kann während der Präsentation aktiv chatten
