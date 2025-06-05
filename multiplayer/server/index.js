const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");

/**
 * Socket.io Server für die Multiplayer-Funktionalität
 * @param {Object} httpServer - Express HTTP-Server
 * @param {Object} supabase - Supabase-Instanz
 */
function setupMultiplayerServer(httpServer, supabase) {
  const io = require("socket.io")(httpServer);

  // Lobby-Daten im Speicher halten
  const lobbies = new Map(); // lobbyId -> LobbyData

  // Socket.io Namespace für die Lobbies
  const lobbyNamespace = io.of("/lobby");

  // Socket-Verbindung verarbeiten
  lobbyNamespace.on("connection", (socket) => {
    console.log("Neuer Client verbunden:", socket.id);

    // Lobby erstellen (Host)
    socket.on("createLobby", async (userData, callback) => {
      const lobbyId = uuidv4();

      // QR-Code für den Join-Link generieren
      const joinUrl = `${
        process.env.BASE_URL || "http://localhost:8080"
      }/join?id=${lobbyId}`;
      const qrCode = await QRCode.toDataURL(joinUrl);

      // User-ID aus dem Socket oder userData holen (sicherstellen, dass sie vorhanden ist)
      // Zuerst versuchen, sie aus dem Socket-Handshake zu bekommen, falls sie dort via Middleware gesetzt wurde
      let userId = socket.handshake.auth ? socket.handshake.auth.userId : null;
      let userName = socket.handshake.auth
        ? socket.handshake.auth.userName
        : "Host";

      // Fallback auf userData, wenn im Handshake nichts war
      if (!userId && userData && userData.userId) {
        userId = userData.userId;
      }
      if (userData && userData.userName) {
        // userName vom Client nehmen, falls vorhanden
        userName = userData.userName;
      }

      if (!userId) {
        console.error(
          "Host User-ID konnte nicht ermittelt werden beim Erstellen der Lobby."
        );
        return callback({
          success: false,
          error: "Host-Identifizierung fehlgeschlagen.",
        });
      }

      // Neue Lobby erstellen
      lobbies.set(lobbyId, {
        hostId: userId, // Speichere die persistente User-ID des Hosts
        hostSocketId: socket.id, // Speichere auch die aktuelle Socket-ID des Hosts
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
      socket.userId = userId; // userId am Socket speichern
      socket.userName = userName;

      // Füge Host direkt zur Spielerliste der Lobby hinzu
      const hostPlayerInfo = {
        id: userId, // Persistente User-ID
        socketId: socket.id,
        name: userName,
        isHost: true,
        joinedAt: Date.now(),
      };
      lobbies.get(lobbyId).players.push(hostPlayerInfo);

      console.log(
        `Lobby erstellt: ${lobbyId} von Host ${userId} (${userName})`
      );

      // Callback mit Lobby-Informationen
      callback({
        success: true,
        lobbyId,
        qrCode,
        joinUrl,
        hostId: userId, // Sende die persistente User-ID des Hosts zurück
        initialPlayers: lobbies.get(lobbyId).players, // Sende die initiale Spielerliste (mit Host)
      });

      // Informiere alle (auch den Host selbst) über den Beitritt des Hosts
      lobbyNamespace.to(lobbyId).emit("playerJoined", hostPlayerInfo);
    });

    // Lobby beitreten (Client)
    socket.on("joinLobby", (data, callback) => {
      const { lobbyId, userName, userId } = data; // Erwarte userId vom Client

      if (!lobbies.has(lobbyId)) {
        return callback({ success: false, error: "Lobby existiert nicht" });
      }
      const lobby = lobbies.get(lobbyId);
      if (lobby.isStarted) {
        return callback({
          success: false,
          error: "Das Spiel hat bereits begonnen",
        });
      }
      if (!userId) {
        console.error(
          "User-ID konnte nicht ermittelt werden beim Beitreten zur Lobby."
        );
        return callback({
          success: false,
          error: "User-Identifizierung fehlgeschlagen.",
        });
      }

      // Prüfen, ob Spieler (basierend auf userId) bereits in der Lobby ist
      const existingPlayer = lobby.players.find((p) => p.id === userId);
      if (existingPlayer) {
        // Spieler ist bereits da, ggf. Socket-ID aktualisieren und Info zurücksenden
        existingPlayer.socketId = socket.id; // Update socketId für den Fall einer Wiederverbindung
        console.log(
          `Spieler ${userName} (${userId}) ist Lobby ${lobbyId} erneut beigetreten (Socket ${socket.id}).`
        );
        socket.join(lobbyId);
        socket.lobbyId = lobbyId;
        socket.isHost = lobby.hostId === userId;
        socket.userId = userId;
        socket.userName = existingPlayer.name; // Namen beibehalten

        return callback({
          success: true,
          lobby: {
            id: lobbyId,
            players: lobby.players,
            hostId: lobby.hostId,
            isStarted: lobby.isStarted,
          },
        });
      }

      socket.lobbyId = lobbyId;
      socket.isHost = lobby.hostId === userId; // Überprüfen, ob der beitretende User der Host ist
      socket.userId = userId; // userId am Socket speichern
      socket.userName = userName || `Spieler ${lobby.players.length + 1}`;

      const playerInfo = {
        id: userId, // Persistente User-ID
        socketId: socket.id,
        name: socket.userName,
        isHost: socket.isHost,
        joinedAt: Date.now(),
      };
      lobby.players.push(playerInfo);
      socket.join(lobbyId);
      lobbyNamespace.to(lobbyId).emit("playerJoined", playerInfo);
      console.log(
        `Spieler ${socket.userName} (${userId}) ist Lobby ${lobbyId} beigetreten (Socket ${socket.id})`
      );

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

      // Prüfen mit der persistenten userId
      if (socket.userId !== lobby.hostId) {
        console.warn(
          `Versuch, Präsentation zu starten von Nicht-Host: ${socket.userId} in Lobby ${lobbyId}. Host ist ${lobby.hostId}`
        );
        return;
      }
      lobby.isStarted = true;
      lobbyNamespace.to(lobbyId).emit("presentationStarted");
      console.log(
        `Präsentation in Lobby ${lobbyId} gestartet von Host ${socket.userId}`
      );
    });

    // Chat-Nachricht verarbeiten
    socket.on("chatMessage", (message) => {
      const lobbyId = socket.lobbyId;

      if (!lobbyId || !lobbies.has(lobbyId)) return;

      const lobby = lobbies.get(lobbyId);

      // Nachrichtenobjekt erstellen
      const messageObj = {
        id: uuidv4(),
        senderId: socket.userId, // Persistente User-ID
        senderSocketId: socket.id,
        senderName: socket.userName,
        text: message,
        isHost: socket.isHost,
        timestamp: Date.now(),
      };

      // Nachricht speichern
      lobby.chatMessages.push(messageObj);

      // Nachricht an alle Teilnehmer senden
      lobbyNamespace.to(lobbyId).emit("newChatMessage", messageObj);

      console.log(
        `Chat-Nachricht in Lobby ${lobbyId} von ${socket.userName} (${socket.userId}): ${message}`
      );
    });

    // Verbindung getrennt
    socket.on("disconnect", () => {
      const lobbyId = socket.lobbyId;

      if (!lobbyId || !lobbies.has(lobbyId)) return;

      const lobby = lobbies.get(lobbyId);
      const disconnectingUserId = socket.userId;

      console.log(
        `Client getrennt: Socket ${socket.id}, User ${disconnectingUserId}, Lobby ${lobbyId}`
      );

      if (
        disconnectingUserId === lobby.hostId &&
        socket.id === lobby.hostSocketId
      ) {
        // Host hat die Verbindung getrennt
        // Hier könnte man eine Logik einbauen, um z.B. einen neuen Host zu bestimmen oder die Lobby nach einer Zeit zu schließen
        // Vorerst: Lobby informieren, dass Host weg ist, aber Lobby noch nicht direkt schließen.
        // Man könnte auch prüfen, ob der Host noch andere offene Sockets für diese Lobby hat.
        lobbyNamespace
          .to(lobbyId)
          .emit("hostDisconnected", {
            hostId: lobby.hostId,
            reason: "Host hat die Verbindung getrennt",
          });
        console.log(
          `Host ${disconnectingUserId} hat Lobby ${lobbyId} verlassen. Lobby wird noch nicht geschlossen.`
        );
        // lobbies.delete(lobbyId); // Lobby vorerst nicht löschen
      } else {
        const playerIndex = lobby.players.findIndex(
          (p) => p.id === disconnectingUserId && p.socketId === socket.id
        );
        if (playerIndex !== -1) {
          const player = lobby.players[playerIndex];
          lobby.players.splice(playerIndex, 1);
          lobbyNamespace
            .to(lobbyId)
            .emit("playerLeft", {
              id: player.id,
              name: player.name,
              socketId: player.socketId,
            });
          console.log(
            `Spieler ${player.name} (${player.id}) hat Lobby ${lobbyId} verlassen (Socket ${socket.id})`
          );
        } else {
          console.log(
            `Zu entfernender Spieler (User ${disconnectingUserId}, Socket ${socket.id}) nicht in Spielerliste von Lobby ${lobbyId} gefunden.`
          );
        }
      }

      // Aufräumen, wenn keine Spieler mehr in der Lobby sind
      if (lobby.players.length === 0) {
        console.log(`Lobby ${lobbyId} ist leer und wird geschlossen.`);
        lobbies.delete(lobbyId);
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
