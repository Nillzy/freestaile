const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");

/**
 * Socket.io Server für die Multiplayer-Funktionalität
 * @param {Object} httpServer - Express HTTP-Server
 */
function setupMultiplayerServer(httpServer) {
  const io = require("socket.io")(httpServer);

  // Lobby-Daten im Speicher halten
  const lobbies = new Map(); // lobbyId -> LobbyData

  // Socket.io Namespace für die Lobbies
  const lobbyNamespace = io.of("/lobby");

  // Socket-Verbindung verarbeiten
  lobbyNamespace.on("connection", (socket) => {
    console.log("Neuer Client verbunden:", socket.id);

    // Lobby erstellen (Host)
    socket.on("createLobby", async (callback) => {
      const lobbyId = uuidv4();

      // QR-Code für den Join-Link generieren
      const joinUrl = `${
        process.env.BASE_URL || "http://localhost:8080"
      }/join/${lobbyId}`;
      const qrCode = await QRCode.toDataURL(joinUrl);

      // Neue Lobby erstellen
      lobbies.set(lobbyId, {
        hostId: socket.id,
        players: [],
        chatMessages: [],
        created: Date.now(),
        isStarted: false,
      });

      // Socket der Lobby beitreten lassen
      socket.join(lobbyId);

      // Hostdaten speichern
      socket.lobbyId = lobbyId;
      socket.isHost = true;
      socket.userName = "Host";

      console.log(`Lobby erstellt: ${lobbyId}`);

      // Callback mit Lobby-Informationen
      callback({
        success: true,
        lobbyId,
        qrCode,
        joinUrl,
      });
    });

    // Lobby beitreten (Client)
    socket.on("joinLobby", (data, callback) => {
      const { lobbyId, userName } = data;

      // Prüfen, ob die Lobby existiert
      if (!lobbies.has(lobbyId)) {
        return callback({
          success: false,
          error: "Lobby existiert nicht",
        });
      }

      const lobby = lobbies.get(lobbyId);

      // Prüfen, ob das Spiel bereits gestartet wurde
      if (lobby.isStarted) {
        return callback({
          success: false,
          error: "Das Spiel hat bereits begonnen",
        });
      }

      // Spielerdaten speichern
      socket.lobbyId = lobbyId;
      socket.isHost = false;
      socket.userName = userName || `Spieler ${lobby.players.length + 1}`;

      // Spieler zur Lobby hinzufügen
      const playerInfo = {
        id: socket.id,
        name: socket.userName,
        joinedAt: Date.now(),
      };

      lobby.players.push(playerInfo);

      // Socket der Lobby beitreten lassen
      socket.join(lobbyId);

      // Allen Spielern in der Lobby über den neuen Spieler informieren
      lobbyNamespace.to(lobbyId).emit("playerJoined", playerInfo);

      console.log(
        `Spieler ${socket.userName} ist Lobby ${lobbyId} beigetreten`
      );

      // Callback mit Lobby-Informationen
      callback({
        success: true,
        lobby: {
          id: lobbyId,
          players: lobby.players,
          hostId: lobby.hostId,
          isStarted: lobby.isStarted,
        },
      });
    });

    // Präsentation starten (nur Host)
    socket.on("startPresentation", () => {
      const lobbyId = socket.lobbyId;

      if (!lobbyId || !lobbies.has(lobbyId)) return;

      const lobby = lobbies.get(lobbyId);

      // Nur der Host darf die Präsentation starten
      if (socket.id !== lobby.hostId) return;

      // Präsentation als gestartet markieren
      lobby.isStarted = true;

      // Alle Clients über den Start informieren
      lobbyNamespace.to(lobbyId).emit("presentationStarted");

      console.log(`Präsentation in Lobby ${lobbyId} gestartet`);
    });

    // Chat-Nachricht verarbeiten
    socket.on("chatMessage", (message) => {
      const lobbyId = socket.lobbyId;

      if (!lobbyId || !lobbies.has(lobbyId)) return;

      const lobby = lobbies.get(lobbyId);

      // Nachrichtenobjekt erstellen
      const messageObj = {
        id: uuidv4(),
        senderId: socket.id,
        senderName: socket.userName,
        text: message,
        isHost: socket.isHost,
        timestamp: Date.now(),
      };

      // Nachricht speichern
      lobby.chatMessages.push(messageObj);

      // Nachricht an alle Teilnehmer senden
      lobbyNamespace.to(lobbyId).emit("newChatMessage", messageObj);

      console.log(`Chat-Nachricht in Lobby ${lobbyId}: ${message}`);
    });

    // Verbindung getrennt
    socket.on("disconnect", () => {
      const lobbyId = socket.lobbyId;

      if (!lobbyId || !lobbies.has(lobbyId)) return;

      const lobby = lobbies.get(lobbyId);

      // Wenn der Host die Verbindung trennt, die Lobby schließen
      if (socket.id === lobby.hostId) {
        lobbyNamespace.to(lobbyId).emit("lobbyEnded", {
          reason: "Der Host hat die Verbindung getrennt",
        });

        // Lobby löschen
        lobbies.delete(lobbyId);

        console.log(`Lobby ${lobbyId} wurde geschlossen (Host getrennt)`);
      } else {
        // Spieler aus der Spielerliste entfernen
        const playerIndex = lobby.players.findIndex((p) => p.id === socket.id);

        if (playerIndex !== -1) {
          const player = lobby.players[playerIndex];
          lobby.players.splice(playerIndex, 1);

          // Anderen Spielern mitteilen, dass ein Spieler gegangen ist
          lobbyNamespace.to(lobbyId).emit("playerLeft", {
            id: socket.id,
            name: player.name,
          });

          console.log(`Spieler ${player.name} hat Lobby ${lobbyId} verlassen`);
        }
      }
    });
  });

  return {
    io,
    lobbyNamespace,
    lobbies,
  };
}

module.exports = setupMultiplayerServer;
