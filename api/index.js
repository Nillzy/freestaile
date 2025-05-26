import express from "express";
import path from "node:path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Eta } from "eta";
import { JSDOM } from "jsdom";
import {} from "dotenv/config";
import validator from "validator";
import cookieParser from "cookie-parser";
import { v4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { authMiddleware, requireAuth } from "./middleware/auth.js";
import { validateRevealSlides } from "./revealValidator.js";
import { fetchSlides, fetchImages } from "./APIService.js";
import {
  fetchPresentation,
  saveSlides,
  createLobby,
  joinLobby,
  getLobbyPlayers,
  getLobbyDetails,
  updateLobbyStatus,
  testSupabaseConnection,
  startGame,
  nextSlide,
  previousSlide,
  sendChatMessage,
  getChatMessages,
  saveLobbySlides,
  getLobbySlides,
  getCurrentSlide,
  createGameEvent,
  updatePlayerScore,
  savePlayerAnswer,
  getScoreboard,
  getFullLobbyData,
  generateJoinCode,
  createLobbyWithCode,
  joinLobbyByCode,
} from "../services/SupabaseService.js";
import QRCode from "qrcode";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const eta = new Eta({ views: path.join(__dirname, "../public") });

// HTTP-Server für Express und Socket.IO
const httpServer = createServer(app);

// Socket.IO initialisieren
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // Für Entwicklung, später anpassen!
    methods: ["GET", "POST"],
  },
});

// Namespace für Lobby
const lobbyNamespace = io.of("/lobby");
lobbyNamespace.on("connection", (socket) => {
  console.log("Neuer Socket.IO-Client verbunden:", socket.id);

  // Lobby beitreten
  socket.on("joinLobby", async (data, callback) => {
    try {
      const { lobbyId, userId, userName } = data;
      console.log("joinLobby Event empfangen:", { lobbyId, userId, userName });

      // Lobby-Details abrufen
      const lobbyDetails = await getLobbyDetails(lobbyId);
      if (!lobbyDetails) {
        const error = "Lobby nicht gefunden";
        console.error(error);
        if (callback) callback({ success: false, error });
        return;
      }

      // Spieler zur Lobby hinzufügen
      const joinResult = await joinLobby(lobbyId, userId, userName);
      if (!joinResult.success) {
        console.error("Fehler beim Beitreten:", joinResult.error);
        if (callback) callback({ success: false, error: joinResult.error });
        return;
      }

      // Socket der Lobby hinzufügen
      socket.join(lobbyId);
      socket.lobbyId = lobbyId;
      socket.userId = userId;
      socket.userName = userName;
      socket.isHost = lobbyDetails.host_id === userId;

      // Aktuelle Spielerliste abrufen
      const players = await getLobbyPlayers(lobbyId);
      console.log("Aktuelle Spielerliste nach Beitritt:", players);

      // Erfolg an den beitretenden Spieler senden
      if (callback) {
        callback({
          success: true,
          lobby: {
            ...lobbyDetails,
            players: players,
            hostId: lobbyDetails.host_id,
          },
        });
      }

      // Alle anderen in der Lobby über neuen Spieler informieren
      socket.to(lobbyId).emit("playerJoined", {
        id: userId,
        user_id: userId,
        name: userName,
        is_host: lobbyDetails.host_id === userId,
        socketId: socket.id,
      });

      // Lobby-Update an ALLE in der Lobby senden (inklusive dem neuen Spieler)
      lobbyNamespace.to(lobbyId).emit("lobbyUpdate", {
        lobbyId: lobbyId,
        players: players,
        lobby: lobbyDetails,
      });

      console.log(`Spieler ${userName} ist Lobby ${lobbyId} beigetreten`);
      console.log(`Lobby ${lobbyId} hat jetzt ${players.length} Spieler`);
    } catch (error) {
      console.error("Fehler beim Lobby-Beitritt:", error);
      if (callback)
        callback({ success: false, error: "Serverfehler beim Beitreten" });
    }
  });

  // Wieder mit Lobby verbinden (für bereits beigetretene Spieler)
  socket.on("reconnectToLobby", async (data) => {
    try {
      const { lobbyId, userId, userName } = data;
      console.log("reconnectToLobby Event empfangen:", {
        lobbyId,
        userId,
        userName,
      });

      // Lobby-Details abrufen
      const lobbyDetails = await getLobbyDetails(lobbyId);
      if (!lobbyDetails) {
        console.error("Lobby nicht gefunden für Reconnect");
        return;
      }

      // Socket der Lobby hinzufügen
      socket.join(lobbyId);
      socket.lobbyId = lobbyId;
      socket.userId = userId;
      socket.userName = userName;
      socket.isHost = lobbyDetails.host_id === userId;

      // Aktuelle Spielerliste abrufen und senden
      const players = await getLobbyPlayers(lobbyId);

      // Lobby-Update an den reconnectenden Spieler senden
      socket.emit("lobbyUpdate", {
        lobbyId: lobbyId,
        players: players,
        lobby: lobbyDetails,
      });

      console.log(
        `Spieler ${userName} hat sich wieder mit Lobby ${lobbyId} verbunden`
      );
    } catch (error) {
      console.error("Fehler beim Reconnect:", error);
    }
  });

  // Lobby erstellen (falls vom Host verwendet)
  socket.on("createLobby", async (data, callback) => {
    try {
      const { userId, userName } = data;
      const lobbyId = v4();
      console.log("createLobby Event empfangen:", {
        lobbyId,
        userId,
        userName,
      });

      const result = await createLobby(lobbyId, userId, userName);
      if (result.success) {
        socket.join(lobbyId);
        socket.lobbyId = lobbyId;
        socket.userId = userId;
        socket.userName = userName;
        socket.isHost = true;

        // Aktuelle Spielerliste abrufen
        const players = await getLobbyPlayers(lobbyId);

        if (callback) {
          callback({
            success: true,
            lobbyId: lobbyId,
            hostId: userId,
            initialPlayers: players,
          });
        }

        console.log(`Lobby ${lobbyId} erstellt von ${userName}`);
      } else {
        console.error("Fehler beim Erstellen der Lobby:", result.error);
        if (callback) callback({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Fehler beim Lobby-Erstellen:", error);
      if (callback)
        callback({ success: false, error: "Serverfehler beim Erstellen" });
    }
  });

  // Präsentation starten
  socket.on("startPresentation", async () => {
    try {
      console.log(
        "startPresentation Event empfangen von:",
        socket.userId,
        "Socket-ID:",
        socket.id
      );

      if (!socket.isHost) {
        socket.emit("error", {
          message: "Nur der Host kann die Präsentation starten",
        });
        return;
      }

      if (!socket.lobbyId) {
        socket.emit("error", {
          message: "Keine Lobby-ID gefunden",
        });
        return;
      }

      // Spiel starten (falls diese Funktion existiert)
      // await startGame(socket.lobbyId);

      // Alle Spieler in der Lobby informieren
      lobbyNamespace.to(socket.lobbyId).emit("presentationStarted", {
        lobbyId: socket.lobbyId,
        message: "Die Präsentation wurde gestartet!",
      });

      console.log(`Präsentation in Lobby ${socket.lobbyId} gestartet`);
    } catch (error) {
      console.error("Fehler beim Starten der Präsentation:", error);
      socket.emit("error", { message: "Fehler beim Starten der Präsentation" });
    }
  });

  // Chat-Nachrichten
  socket.on("chatMessage", async (data) => {
    try {
      const { lobbyId, userId, userName, message, isHost } = data;

      if (!lobbyId || !userId || !userName || !message) {
        console.error("Unvollständige Chat-Nachricht:", data);
        return;
      }

      // Nachricht an alle in der Lobby weiterleiten
      lobbyNamespace.to(lobbyId).emit("chatMessage", {
        userId: userId,
        userName: userName,
        message: message.trim(),
        isHost: isHost || false,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `Chat-Nachricht in Lobby ${lobbyId} von ${userName}: ${message}`
      );
    } catch (error) {
      console.error("Fehler beim Verarbeiten der Chat-Nachricht:", error);
    }
  });

  // Slide-Änderungen (nur vom Host)
  socket.on("slideChange", async (data) => {
    try {
      const { lobbyId, slideIndex } = data;

      if (!socket.isHost) {
        console.warn("Nicht-Host versucht Slide zu ändern:", socket.userId);
        return;
      }

      if (!lobbyId || typeof slideIndex !== "number") {
        console.error("Ungültige Slide-Change-Daten:", data);
        return;
      }

      // Slide-Änderung an alle anderen in der Lobby senden (außer Host)
      socket.to(lobbyId).emit("slideChanged", {
        slideIndex: slideIndex,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `Host ${socket.userName} änderte Slide zu Index ${slideIndex} in Lobby ${lobbyId}`
      );
    } catch (error) {
      console.error("Fehler beim Verarbeiten der Slide-Änderung:", error);
    }
  });

  // Verbindung getrennt
  socket.on("disconnect", async () => {
    console.log("Socket getrennt:", socket.id);

    if (socket.lobbyId && socket.userId) {
      try {
        // Spieler aus der Lobby entfernen (hier könntest du eine removeLobbyPlayer-Funktion implementieren)

        // Andere Spieler informieren
        socket.to(socket.lobbyId).emit("playerLeft", {
          userId: socket.userId,
          userName: socket.userName,
          isHost: socket.isHost,
        });

        // Falls Host die Verbindung trennt
        if (socket.isHost) {
          lobbyNamespace.to(socket.lobbyId).emit("hostDisconnected", {
            message: "Der Host hat die Verbindung getrennt",
          });
        }

        // Aktualisierte Spielerliste senden
        const players = await getLobbyPlayers(socket.lobbyId);
        lobbyNamespace.to(socket.lobbyId).emit("lobbyUpdate", {
          lobbyId: socket.lobbyId,
          players: players,
        });
      } catch (error) {
        console.error("Fehler beim Disconnect-Handling:", error);
      }
    }
  });
});

// Supabase Client für Backend-Authentifizierung
const supabase = createClient(
  `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
  process.env.SUPABASE_API_KEY
);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware); // Auth-Middleware für alle Routes

// Statische Dateien - Reihenfolge ist wichtig!
app.use("/api", express.static(path.join(__dirname, "public"))); // Für /api/public Dateien
app.use(express.static(path.join(__dirname, "../public"))); // Für /public Dateien

// Logout-Route
app.post("/api/auth/logout", async (req, res) => {
  const token = req.cookies.session;
  if (token) {
    try {
      await supabase.auth.signOut(token);
    } catch (error) {
      console.error("Logout Fehler:", error);
    }
  }
  res.clearCookie("session");
  res.json({ message: "Erfolgreich abgemeldet" });
});

// Login-Route (aktualisiert)
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "E-Mail und Passwort sind erforderlich",
    });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        message: "Ungültige Anmeldedaten",
      });
    }

    // Setze den Session-Cookie
    res.cookie("session", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 Stunden
    });

    res.json({
      message: "Erfolgreich angemeldet",
      user: data.user,
    });
  } catch (error) {
    console.error("Login-Fehler:", error);
    res.status(500).json({
      message: "Ein Fehler ist aufgetreten",
    });
  }
});

// Register-Route
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "E-Mail und Passwort sind erforderlich",
    });
  }

  // E-Mail Validierung
  if (!validator.isEmail(email)) {
    return res.status(400).json({
      message: "Ungültige E-Mail-Adresse",
    });
  }

  // Passwort Validierung
  if (password.length < 8) {
    return res.status(400).json({
      message: "Passwort muss mindestens 8 Zeichen lang sein",
    });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${req.protocol}://${req.get("host")}/`,
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        return res.status(400).json({
          message: "Diese E-Mail-Adresse ist bereits registriert",
        });
      }
      return res.status(400).json({
        message: error.message,
      });
    }

    res.json({
      message:
        "Registrierung erfolgreich. Bitte bestätigen Sie Ihre E-Mail-Adresse.",
      user: data.user,
    });
  } catch (error) {
    console.error("Registrierungs-Fehler:", error);
    res.status(500).json({
      message: "Ein Fehler ist aufgetreten",
    });
  }
});

// Startseite Route (aktualisiert)
app.get("/", (req, res) => {
  res.send(eta.render("homepage", { user: req.user }));
});

// Landing Page Route (aktualisiert)
app.get("/main", (req, res) => {
  res.send(eta.render("dashboardNew", { user: req.user }));
});

app.get("/multi", (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  res.send(eta.render("multiplayer", { user: req.user }));
});

app.get("/create-lobby", async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }

  console.log("User creating/joining lobby:", req.user);

  // Prüfe, ob eine bestehende Lobby-ID übergeben wurde
  const existingLobbyId = req.query.id;
  const playerName = req.query.name || req.user.email.split("@")[0];

  try {
    // Generiere QR-Code und Join-URL
    const lobbyId = existingLobbyId || v4();
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const joinUrl = `${baseUrl}/join?id=${lobbyId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);

    // Generiere eine unique ID für den Benutzer, falls keine vorhanden
    const userId = req.user.id || req.user.email || v4();

    console.log("Creating/joining lobby with userId:", userId);
    console.log("Lobby ID:", lobbyId);
    console.log("Player name:", playerName);

    // Wenn eine bestehende Lobby-ID übergeben wurde, versuche der Lobby beizutreten
    if (existingLobbyId) {
      console.log("Joining existing lobby:", existingLobbyId);
      const joinResult = await joinLobby(lobbyId, userId, playerName);

      if (!joinResult) {
        console.error("Failed to join lobby");
        return res.redirect(
          `/error-page?message=Die Lobby existiert nicht oder ist bereits geschlossen.`
        );
      }

      console.log("Join result:", joinResult);

      // Hole die Spielerliste und Lobby-Details
      const players = await getLobbyPlayers(lobbyId);
      const lobbyDetails = await getLobbyDetails(lobbyId);

      console.log("Lobby players:", players);
      console.log("Lobby details:", lobbyDetails);

      // Rendere die Lobby-Seite
      res.send(
        eta.render("lobby", {
          user: req.user,
          userId: userId,
          userName: playerName,
          lobbyId: lobbyId,
          qrCode: qrCodeDataUrl,
          joinUrl: joinUrl,
          isHost: false,
          playerName: playerName,
          players: players || [],
          lobbyDetails: lobbyDetails || {},
        })
      );
    } else {
      console.log("Creating new lobby");
      // Erstelle eine neue Lobby
      const lobbyResult = await createLobby(lobbyId, userId, playerName);

      if (!lobbyResult) {
        console.error("Failed to create lobby");
        return res.redirect(
          `/error-page?message=Fehler beim Erstellen der Lobby.`
        );
      }

      console.log("Create lobby result:", lobbyResult);

      // Hole die Spielerliste (sollte nur den Host enthalten)
      const players = await getLobbyPlayers(lobbyId);

      console.log("Lobby players after creation:", players);

      // Wenn keine Spieler gefunden wurden, erstelle manuell einen Host-Spieler
      const playersList =
        players && players.length > 0
          ? players
          : [
              {
                id: "host-manual",
                lobby_id: lobbyId,
                user_id: userId,
                name: playerName,
                joined_at: new Date(),
                is_host: true,
              },
            ];

      console.log("Final players list:", playersList);

      // Rendere die Lobby-Seite
      res.send(
        eta.render("lobby", {
          user: req.user,
          userId: userId,
          userName: playerName,
          lobbyId: lobbyId,
          qrCode: qrCodeDataUrl,
          joinUrl: joinUrl,
          isHost: true,
          playerName: playerName,
          players: playersList,
          lobbyDetails: lobbyResult || {},
        })
      );
    }
  } catch (error) {
    console.error("Fehler beim Erstellen/Beitreten der Lobby:", error);
    res.redirect(
      "/error-page?message=Fehler bei der Lobby-Erstellung: " + error.message
    );
  }
});

// Zusätzlicher Endpunkt, um Lobby-Daten abzurufen (für regelmäßige Aktualisierungen)
app.get("/api/lobby/:lobbyId", async (req, res) => {
  try {
    const lobbyId = req.params.lobbyId;
    console.log("API: Fetching lobby data for ID:", lobbyId);

    // Hole die Spielerliste und Lobby-Details
    const players = await getLobbyPlayers(lobbyId);
    const lobbyDetails = await getLobbyDetails(lobbyId);

    console.log("API: Lobby details:", lobbyDetails);
    console.log("API: Players found:", players);

    if (!lobbyDetails) {
      console.log("API: Lobby not found");
      return res.status(404).json({ error: "Lobby nicht gefunden" });
    }

    // Wenn keine Spieler gefunden wurden, füge zumindest den Host hinzu
    let playersList = players;
    if (!players || players.length === 0) {
      console.log("API: No players found, adding host as fallback");
      playersList = [
        {
          id: "host-fallback",
          lobby_id: lobbyId,
          user_id: lobbyDetails.host_id,
          name: lobbyDetails.host_name,
          joined_at: lobbyDetails.created_at,
          is_host: true,
        },
      ];
    }

    const response = {
      lobby: lobbyDetails,
      players: playersList || [],
    };

    console.log("API: Sending response:", response);
    res.json(response);
  } catch (error) {
    console.error("Fehler beim Abrufen der Lobby-Daten:", error);
    res.status(500).json({
      error: "Fehler beim Abrufen der Lobby-Daten",
      details: error.message,
    });
  }
});

// Endpunkt zum Aktualisieren des Lobby-Status
app.post("/api/lobby/:lobbyId/status", async (req, res) => {
  try {
    const lobbyId = req.params.lobbyId;
    const { status } = req.body;

    // Prüfe, ob der Benutzer der Host der Lobby ist
    const lobbyDetails = await getLobbyDetails(lobbyId);

    if (!lobbyDetails || lobbyDetails.host_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Nur der Host kann den Status der Lobby ändern" });
    }

    // Aktualisiere den Status
    const updateResult = await updateLobbyStatus(lobbyId, status);

    if (!updateResult) {
      return res
        .status(500)
        .json({ error: "Fehler beim Aktualisieren des Lobby-Status" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Lobby-Status:", error);
    res
      .status(500)
      .json({ error: "Fehler beim Aktualisieren des Lobby-Status" });
  }
});

app.get("/join", (req, res) => {
  const lobbyId = req.query.id;

  if (!lobbyId) {
    return res.redirect("/main");
  }

  // Generiere userId und userName
  const userId = req.user ? req.user.id || req.user.email || v4() : v4();
  const userName = req.user ? req.user.email.split("@")[0] : "";

  // Rendere die Join-Seite
  res.send(
    eta.render("join", {
      user: req.user,
      lobbyId: lobbyId,
      userId: userId,
      userName: userName,
    })
  );
});

// Neue Lobby-Route für Teilnehmer
app.get("/lobby", async (req, res) => {
  const lobbyId = req.query.id;
  const userId = req.query.userId;
  const userName = req.query.userName;
  const isHost = req.query.isHost === "true";

  if (!lobbyId) {
    return res.redirect("/main");
  }

  try {
    // Lade Lobby-Details und Spieler
    const lobbyDetails = await getLobbyDetails(lobbyId);
    const players = await getLobbyPlayers(lobbyId);

    if (!lobbyDetails) {
      return res.redirect(`/error-page?message=Lobby nicht gefunden`);
    }

    // QR-Code und Join-URL generieren
    const joinUrl = `${req.protocol}://${req.get("host")}/join?id=${lobbyId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);

    console.log("Lobby-Route aufgerufen:", {
      lobbyId,
      userId,
      userName,
      isHost,
      playersCount: players?.length || 0,
    });

    // Rendere die Lobby-Seite
    res.send(
      eta.render("lobby", {
        user: req.user,
        userId: userId || v4(),
        userName: userName || "Gast",
        lobbyId: lobbyId,
        qrCode: qrCodeDataUrl,
        joinUrl: joinUrl,
        isHost: isHost,
        playerName: userName || "Gast",
        players: players || [],
        lobbyDetails: lobbyDetails || {},
      })
    );
  } catch (error) {
    console.error("Fehler beim Laden der Lobby-Seite:", error);
    return res.redirect(`/error-page?message=Fehler beim Laden der Lobby`);
  }
});

// Error Page Route (aktualisiert)
app.get("/error-page", (req, res) => {
  res.send(
    eta.render("error-page", {
      user: req.user,
      message: req.query.message,
    })
  );
});

// Beispiel für eine geschützte Route
app.get("/dashboard", requireAuth, (req, res) => {
  res.send(eta.render("dashboard", { user: req.user }));
});

app.get("/present", (req, res) => {
  if (
    req.query.topic !== undefined ||
    req.query.presentationLanguage !== undefined
  ) {
    fetchSlides(req.query.topic, req.query.presentationLanguage)
      .then((content) => insertImages(content))
      .then((contentWithImages) => {
        res.send(
          eta.render("presentation-page", {
            topic: req.query.topic,
            presentationLanguage: req.query.presentationLanguage,
            content: contentWithImages,
          })
        );
      })
      .catch((error) => {
        console.error("Error fetching slides:", error);
        res.status(500).send(
          eta.render("error-page", {
            message: "Fehler beim Abrufen der Präsentation",
          })
        );
      });
  } else {
    res.redirect("/");
  }
});

async function insertImages(content) {
  // Erzeuge ein virtuelles DOM aus dem HTML-String
  const dom = new JSDOM(content);
  const document = dom.window.document;

  // Finde alle <img>-Elemente mit data-motif
  const imgElements = Array.from(document.querySelectorAll("img[data-motif]"));

  // Extrahiere alle data-motif-Werte
  const dataContents = imgElements.map((el) => el.getAttribute("data-motif"));

  // fetchImages ist deine eigene Methode, die ein Array von Links zurückgibt
  const images = await fetchImages(dataContents);

  // Setze die src-Attribute entsprechend
  imgElements.forEach((img, index) => {
    if (images[index]) {
      img.setAttribute("src", images[index]);
    }
  });

  return document.body.innerHTML;
}

app.get("/present2", async (req, res) => {
  let presentationID = req.query.presentationID;
  if (
    presentationID === undefined ||
    presentationID === "" ||
    !validator.isUUID(presentationID)
  ) {
    res.redirect("/");
  } else {
    const data = await fetchPresentation(presentationID);

    if (!data) {
      eta.render("error-page", {
        message: "Fehler beim Abrufen und Speichern der Präsentation",
      });
      return;
    }

    console.log(data);

    res.send(
      eta.render("presentation-page", {
        topic: data.topic,
        content: data.content,
      })
    );
  }
});

const presentationStatuses = new Map();

app.get("/initiateGeneration", async (req, res) => {
  let topic = req.query.presentationID.toString;
  let presentationLanguage = req.query.presentationID.toString();
  if (
    topic !== undefined ||
    topic !== "" ||
    presentationLanguage !== undefined ||
    presentationLanguage !== ""
  ) {
    try {
      const presentationID = v4();
      presentationStatuses.set(presentationID, {
        status: "processing",
        timestamp: Date.now(),
      });

      res.send(
        eta.render("generation-status", {
          presentationID: presentationID,
        })
      );

      //Background process:
      const topic = req.query.topic;
      const presentationLanguage = req.query.presentationLanguage;
      const contentWithoutImages = await fetchSlides(
        topic,
        presentationLanguage
      );
      const content = await insertImages(contentWithoutImages);
      const successful = await saveSlides(presentationID, content, topic);

      if (!successful) {
        presentationStatuses.set(presentationID, {
          status: "error",
          message: "Fehler beim Speichern der Präsentation",
          timestamp: Date.now(),
        });
        return;
      }

      presentationStatuses.set(presentationID, {
        status: "completed",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error while fetching and saving slides:", error);
      if (presentationID) {
        presentationStatuses.set(presentationID, {
          status: "error",
          message: "Fehler beim Generieren der Präsentation",
          timestamp: Date.now(),
        });
      }
      res.status(500).send(
        eta.render("error-page", {
          message: "Fehler beim Abrufen und Speichern der Präsentation",
        })
      );
    }
  } else {
    res.redirect("/");
  }
});

app.get("/checkGenerationStatus", (req, res) => {
  const presentationID = req.query.presentationID;
  if (!presentationID || !validator.isUUID(presentationID)) {
    return res
      .status(400)
      .json({ status: "error", message: "Ungültige Präsentations-ID" });
  }

  const status = presentationStatuses.get(presentationID);
  if (!status) {
    return res
      .status(404)
      .json({ status: "error", message: "Präsentation nicht gefunden" });
  }

  res.json(status);
});

// Cleanup alte Status-Einträge alle 30 Minuten
setInterval(() => {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  for (const [id, status] of presentationStatuses.entries()) {
    if (status.timestamp && status.timestamp < thirtyMinutesAgo) {
      presentationStatuses.delete(id);
    }
  }
}, 30 * 60 * 1000);

// Testroute für Supabase-Verbindung
app.get("/api/test-connection", async (req, res) => {
  try {
    const result = await testSupabaseConnection();
    res.json(result);
  } catch (error) {
    console.error("Fehler beim Testen der Verbindung:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== NEUE MULTIPLAYER-API-ENDPUNKTE =====

// Host Game - Erstelle Lobby mit 6-stelligem Code
app.post("/api/multiplayer/host", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { name } = req.body;
    const hostName = name || req.user.email.split("@")[0];

    const result = await createLobbyWithCode(req.user.id, hostName);

    if (!result) {
      return res.status(500).json({ error: "Fehler beim Erstellen der Lobby" });
    }

    res.json({
      success: true,
      code: result.code,
      lobbyId: result.lobby.id,
      playerId: result.player.id,
      isHost: true,
    });
  } catch (error) {
    console.error("Fehler beim Hosten des Spiels:", error);
    res.status(500).json({ error: "Fehler beim Erstellen der Lobby" });
  }
});

// Join Game - Trete Lobby über 6-stelligen Code bei
app.post("/api/multiplayer/join", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: "Code und Name sind erforderlich" });
    }

    const playerName = name.trim();

    const result = await joinLobbyByCode(
      code.toUpperCase(),
      req.user.id,
      playerName
    );

    if (!result) {
      return res
        .status(404)
        .json({ error: "Lobby nicht gefunden oder Fehler beim Beitreten" });
    }

    res.json({
      success: true,
      lobbyId: result.lobby.id,
      playerId: result.player.id,
      isHost: false,
    });
  } catch (error) {
    console.error("Fehler beim Beitreten des Spiels:", error);
    res
      .status(500)
      .json({ error: error.message || "Fehler beim Beitreten der Lobby" });
  }
});

// Vollständige Lobby-Daten abrufen (mit Chat, Spielern, Folien)
app.get("/api/multiplayer/lobby/:lobbyId/full", async (req, res) => {
  try {
    const { lobbyId } = req.params;

    const data = await getFullLobbyData(lobbyId);

    if (!data) {
      return res.status(404).json({ error: "Lobby nicht gefunden" });
    }

    res.json(data);
  } catch (error) {
    console.error("Fehler beim Abrufen der Lobby-Daten:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Lobby-Daten" });
  }
});

// Spiel starten (nur Host)
app.post("/api/multiplayer/lobby/:lobbyId/start", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { lobbyId } = req.params;

    const result = await startGame(lobbyId, req.user.id);

    if (!result) {
      return res
        .status(403)
        .json({ error: "Nur der Host kann das Spiel starten" });
    }

    res.json({ success: true, lobby: result });
  } catch (error) {
    console.error("Fehler beim Starten des Spiels:", error);
    res
      .status(500)
      .json({ error: error.message || "Fehler beim Starten des Spiels" });
  }
});

// Nächste Folie (nur Host)
app.post("/api/multiplayer/lobby/:lobbyId/next-slide", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { lobbyId } = req.params;

    const result = await nextSlide(lobbyId, req.user.id);

    if (!result) {
      return res
        .status(403)
        .json({ error: "Nur der Host kann Folien wechseln" });
    }

    res.json({ success: true, lobby: result });
  } catch (error) {
    console.error("Fehler beim Wechseln zur nächsten Folie:", error);
    res
      .status(500)
      .json({ error: error.message || "Fehler beim Wechseln der Folie" });
  }
});

// Vorherige Folie (nur Host)
app.post("/api/multiplayer/lobby/:lobbyId/previous-slide", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { lobbyId } = req.params;

    const result = await previousSlide(lobbyId, req.user.id);

    if (!result) {
      return res
        .status(403)
        .json({ error: "Nur der Host kann Folien wechseln" });
    }

    res.json({ success: true, lobby: result });
  } catch (error) {
    console.error("Fehler beim Wechseln zur vorherigen Folie:", error);
    res
      .status(500)
      .json({ error: error.message || "Fehler beim Wechseln der Folie" });
  }
});

// Chat-Nachricht senden
app.post("/api/multiplayer/lobby/:lobbyId/chat", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { lobbyId } = req.params;
    const { message, playerId } = req.body;

    if (!message || !playerId) {
      return res
        .status(400)
        .json({ error: "Nachricht und Spieler-ID sind erforderlich" });
    }

    const result = await sendChatMessage(lobbyId, playerId, message.trim());

    if (!result) {
      return res
        .status(500)
        .json({ error: "Fehler beim Senden der Nachricht" });
    }

    res.json({ success: true, message: result });
  } catch (error) {
    console.error("Fehler beim Senden der Chat-Nachricht:", error);
    res.status(500).json({ error: "Fehler beim Senden der Nachricht" });
  }
});

// Chat-Nachrichten abrufen
app.get("/api/multiplayer/lobby/:lobbyId/chat", async (req, res) => {
  try {
    const { lobbyId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const messages = await getChatMessages(lobbyId, limit);

    res.json({ messages });
  } catch (error) {
    console.error("Fehler beim Abrufen der Chat-Nachrichten:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Nachrichten" });
  }
});

// Folien für Lobby speichern
app.post("/api/multiplayer/lobby/:lobbyId/slides", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { lobbyId } = req.params;
    const { slides } = req.body;

    if (!slides || !Array.isArray(slides)) {
      return res.status(400).json({ error: "Folien-Array ist erforderlich" });
    }

    // Prüfe, ob der User der Host ist
    const lobby = await getLobbyDetails(lobbyId);
    if (!lobby || lobby.host_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Nur der Host kann Folien speichern" });
    }

    const result = await saveLobbySlides(lobbyId, slides);

    if (!result) {
      return res
        .status(500)
        .json({ error: "Fehler beim Speichern der Folien" });
    }

    res.json({ success: true, slides: result });
  } catch (error) {
    console.error("Fehler beim Speichern der Folien:", error);
    res.status(500).json({ error: "Fehler beim Speichern der Folien" });
  }
});

// Folien für Lobby abrufen
app.get("/api/multiplayer/lobby/:lobbyId/slides", async (req, res) => {
  try {
    const { lobbyId } = req.params;

    const slides = await getLobbySlides(lobbyId);

    res.json({ slides });
  } catch (error) {
    console.error("Fehler beim Abrufen der Folien:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Folien" });
  }
});

// Aktuelle Folie abrufen
app.get("/api/multiplayer/lobby/:lobbyId/current-slide", async (req, res) => {
  try {
    const { lobbyId } = req.params;

    const slide = await getCurrentSlide(lobbyId);

    res.json({ slide });
  } catch (error) {
    console.error("Fehler beim Abrufen der aktuellen Folie:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der aktuellen Folie" });
  }
});

// Scoreboard abrufen
app.get("/api/multiplayer/lobby/:lobbyId/scoreboard", async (req, res) => {
  try {
    const { lobbyId } = req.params;

    const scoreboard = await getScoreboard(lobbyId);

    res.json({ scoreboard });
  } catch (error) {
    console.error("Fehler beim Abrufen des Scoreboards:", error);
    res.status(500).json({ error: "Fehler beim Abrufen des Scoreboards" });
  }
});

// Spieler-Antwort speichern
app.post("/api/multiplayer/lobby/:lobbyId/answer", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Nicht authentifiziert" });
    }

    const { lobbyId } = req.params;
    const { playerId, slideId, answer, points } = req.body;

    if (!playerId || !slideId || !answer) {
      return res
        .status(400)
        .json({ error: "Spieler-ID, Folien-ID und Antwort sind erforderlich" });
    }

    const result = await savePlayerAnswer(
      lobbyId,
      playerId,
      slideId,
      answer,
      points || 0
    );

    if (!result) {
      return res
        .status(500)
        .json({ error: "Fehler beim Speichern der Antwort" });
    }

    res.json({ success: true, answer: result });
  } catch (error) {
    console.error("Fehler beim Speichern der Antwort:", error);
    res.status(500).json({ error: "Fehler beim Speichern der Antwort" });
  }
});

// Spieler-Score aktualisieren
app.post(
  "/api/multiplayer/lobby/:lobbyId/player/:playerId/score",
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Nicht authentifiziert" });
      }

      const { lobbyId, playerId } = req.params;
      const { score } = req.body;

      if (typeof score !== "number") {
        return res.status(400).json({ error: "Score muss eine Zahl sein" });
      }

      // Prüfe, ob der User der Host ist
      const lobby = await getLobbyDetails(lobbyId);
      if (!lobby || lobby.host_id !== req.user.id) {
        return res
          .status(403)
          .json({ error: "Nur der Host kann Scores aktualisieren" });
      }

      const result = await updatePlayerScore(playerId, score);

      if (!result) {
        return res
          .status(500)
          .json({ error: "Fehler beim Aktualisieren des Scores" });
      }

      res.json({ success: true, player: result });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Scores:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Scores" });
    }
  }
);

// ===== ERWEITERTE LOBBY-ROUTES =====

// Match/Präsentations-Route mit Reveal.js und Chat
app.get("/match", async (req, res) => {
  try {
    const { id: lobbyId, userId, userName, isHost } = req.query;

    if (!lobbyId || !userId || !userName) {
      return res.redirect("/main?error=Fehlende Parameter für Match");
    }

    // Lobby-Details und Spieler abrufen
    const lobbyDetails = await getLobbyDetails(lobbyId);
    if (!lobbyDetails) {
      return res.redirect("/main?error=Lobby nicht gefunden");
    }

    const players = await getLobbyPlayers(lobbyId);

    // QR-Code für Join-Link generieren
    const joinUrl = `${req.protocol}://${req.get("host")}/join?id=${lobbyId}`;
    let qrCode = null;
    try {
      qrCode = await QRCode.toDataURL(joinUrl);
    } catch (qrError) {
      console.warn("QR-Code konnte nicht generiert werden:", qrError);
    }

    res.send(
      eta.render("match", {
        lobbyId: lobbyId,
        userId: userId,
        userName: userName,
        isHost: isHost === "true",
        players: players || [],
        lobbyDetails: lobbyDetails,
        joinUrl: joinUrl,
        qrCode: qrCode,
      })
    );
  } catch (error) {
    console.error("Fehler beim Laden der Match-Seite:", error);
    res.redirect("/main?error=Fehler beim Laden der Match-Seite");
  }
});

// Erweiterte Lobby-Route mit Multiplayer-Features
app.get("/multiplayer-lobby/:lobbyId", async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/");
    }

    const { lobbyId } = req.params;
    const data = await getFullLobbyData(lobbyId);

    if (!data || !data.lobby) {
      return res.redirect("/error-page?message=Lobby nicht gefunden");
    }

    // Prüfe, ob der User in der Lobby ist
    const userPlayer = data.players.find((p) => p.user_id === req.user.id);
    if (!userPlayer) {
      return res.redirect("/error-page?message=Sie sind nicht in dieser Lobby");
    }

    res.send(
      eta.render("multiplayer-lobby", {
        user: req.user,
        lobbyData: data,
        isHost: userPlayer.is_host,
        currentPlayer: userPlayer,
      })
    );
  } catch (error) {
    console.error("Fehler beim Laden der Multiplayer-Lobby:", error);
    res.redirect("/error-page?message=Fehler beim Laden der Lobby");
  }
});

// Multiplayer-Präsentations-Route
app.get("/multiplayer-presentation/:lobbyId", async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/");
    }

    const { lobbyId } = req.params;
    const data = await getFullLobbyData(lobbyId);

    if (!data || !data.lobby) {
      return res.redirect("/error-page?message=Lobby nicht gefunden");
    }

    // Prüfe, ob das Spiel gestartet wurde
    if (data.lobby.status !== "playing") {
      return res.redirect(`/multiplayer-lobby/${lobbyId}`);
    }

    // Prüfe, ob der User in der Lobby ist
    const userPlayer = data.players.find((p) => p.user_id === req.user.id);
    if (!userPlayer) {
      return res.redirect("/error-page?message=Sie sind nicht in dieser Lobby");
    }

    res.send(
      eta.render("multiplayer-presentation", {
        user: req.user,
        lobbyData: data,
        isHost: userPlayer.is_host,
        currentPlayer: userPlayer,
      })
    );
  } catch (error) {
    console.error("Fehler beim Laden der Multiplayer-Präsentation:", error);
    res.redirect("/error-page?message=Fehler beim Laden der Präsentation");
  }
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});

// Exportiere den Express-Handler für Vercel
export default app;
