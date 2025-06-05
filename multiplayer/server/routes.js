const express = require("express");
const QRCode = require("qrcode");

/**
 * Express-Routen für die Multiplayer-Funktionalität
 * @param {Object} app - Express-App
 * @param {Object} multiplayerServer - Socket.io-Multiplayer-Server
 */
function setupMultiplayerRoutes(app, multiplayerServer) {
  const { lobbies } = multiplayerServer;

  // Lobby erstellen und als Host beitreten
  app.get("/lobby/:lobbyId", (req, res) => {
    const lobbyId = req.params.lobbyId;

    // Prüfen, ob die Lobby existiert
    if (!lobbies.has(lobbyId)) {
      return res.redirect("/error-page?message=Lobby%20nicht%20gefunden");
    }

    // Lobby-Infos für die Rendering-Vorlage
    const lobby = lobbies.get(lobbyId);
    const joinUrl = `${
      process.env.BASE_URL || "http://localhost:8080"
    }/join/${lobbyId}`;

    // QR-Code generieren (synchron)
    QRCode.toDataURL(joinUrl, (err, qrCode) => {
      if (err) {
        console.error("Fehler beim Generieren des QR-Codes:", err);
        return res.redirect(
          "/error-page?message=Fehler%20beim%20Generieren%20des%20QR-Codes"
        );
      }

      // Lobby-Seite rendern
      res.send(
        app.eta.render("lobby", {
          user: req.user,
          lobbyId,
          qrCode,
          joinUrl,
          isHost: true,
          players: lobby.players,
        })
      );
    });
  });

  // Join-Seite für Clients
  app.get("/join/:lobbyId", (req, res) => {
    const lobbyId = req.params.lobbyId;

    // Prüfen, ob die Lobby existiert
    if (!lobbies.has(lobbyId)) {
      return res.redirect("/error-page?message=Lobby%20nicht%20gefunden");
    }

    // Join-Seite rendern
    res.send(
      app.eta.render("join", {
        user: req.user,
        lobbyId,
      })
    );
  });

  // Präsentationsseite
  app.get("/presentation/:lobbyId", (req, res) => {
    const lobbyId = req.params.lobbyId;

    // Prüfen, ob die Lobby existiert
    if (!lobbies.has(lobbyId)) {
      return res.redirect("/error-page?message=Lobby%20nicht%20gefunden");
    }

    // Lobby-Infos
    const lobby = lobbies.get(lobbyId);

    // Prüfen, ob die Präsentation gestartet wurde
    if (!lobby.isStarted) {
      return res.redirect(`/lobby/${lobbyId}`);
    }

    // Präsentationsseite rendern
    res.send(
      app.eta.render("multiplayer-presentation", {
        user: req.user,
        lobbyId,
        isHost: false, // Standardwert, wird im Client durch Socket-Info überschrieben
      })
    );
  });
}

module.exports = setupMultiplayerRoutes;
