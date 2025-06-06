import express from "express";
import path from "node:path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Eta } from "eta";
import { JSDOM } from "jsdom";
import dotenv from "dotenv";
import favicon from "serve-favicon";
//import { validateRevealSlides } from "./revealValidator.js";
//import { exampleUsage, testInvalidSlides } from "./revealValidatorExample.js";
import validator from "validator";
import cookieParser from "cookie-parser";
import { v4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { authMiddleware, requireAuth } from "./middleware/auth.js";
import { validateRevealSlides } from "./revealValidator.js";
import { fetchSlides, fetchImages } from "./APIService.js";
import {
  getPresentationIDsFromRoundID,
  createRound,
  setPresentationIDsAndPlayersFromRoundID,
  fetchPlayerName,
  getRoundsFromAccountID,
} from "./SupabaseService.js";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env Datei aus dem api/ Verzeichnis laden
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const eta = new Eta({ views: path.join(__dirname, "../public") });

let presentationStatus = new Map();

app.use(favicon(path.join(__dirname, "../public/assets/favicon.ico")));

// Express-Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

// Supabase Client für Backend-Authentifizierung
const supabase = createClient(
  `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
  process.env.SUPABASE_API_KEY
);

//jrtjrzjtjrtz

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

app.post("/api/auth/delete-account", requireAuth, async (req, res) => {
  try {
    const { error: presentationsInRoundError } = await supabase
      .from("Presentations_in_Round")
      .delete()
      .eq("a_id", req.user.id);

    if (presentationsInRoundError) {
      console.error(
        "Fehler beim Löschen der Präsentationen:",
        presentationsInRoundError
      );
      return res
        .status(500)
        .json({ error: "Fehler beim Löschen der Benutzerdaten" });
    }

    const { error: presentationsError } = await supabase
      .from("Presentations")
      .delete()
      .eq("a_id", req.user.id);

    if (presentationsError) {
      console.error(
        "Fehler beim Löschen der Präsentationen:",
        presentationsError
      );
      return res
        .status(500)
        .json({ error: "Fehler beim Löschen der Benutzerdaten" });
    }

    // Lösche zuerst alle abhängigen Daten
    const { error: roundsError } = await supabase
      .from("Rounds")
      .delete()
      .eq("a_id", req.user.id);

    if (roundsError) {
      console.error("Fehler beim Löschen der Runden:", roundsError);
      return res
        .status(500)
        .json({ error: "Fehler beim Löschen der Benutzerdaten" });
    }

    // Lösche den Benutzer bei Supabase
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(
      req.user.id
    );

    if (deleteUserError) {
      console.error(
        "Fehler beim Löschen des Supabase-Accounts:",
        deleteUserError
      );
      return res
        .status(500)
        .json({ error: "Fehler beim Löschen des Accounts" });
    }

    // Lösche den Session-Cookie
    res.clearCookie("session");

    res.status(200).json({ message: "Account erfolgreich gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen des Accounts:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

app.post("/initiateGeneration", async (req, res) => {
  const presentationLanguage = /*req.body.presentationLanguage*/ "en";
  const accountID = req.user.id;
  const presentations = req.body.presentations;
  console.log(presentations);

  if (presentations === undefined || presentations.length === 0) {
    return res
      .status(500)
      .json({
        message: "Request not valid",
      })
      .send();
  }

  let playersAndTopics = [];

  for (let i = 0; i < presentations.length; i++) {
    const playerAndTopic = {
      player: presentations[i].player,
      topic: presentations[i].topic,
    };
    playersAndTopics.push(playerAndTopic);
  }

  const roundID = v4();

  const roundCreated = await createRound(roundID, req.user.id);

  if (!roundCreated) {
    return res
      .status(500)
      .json({
        message: "Round could not be created",
      })
      .send();
  }

  let presentationIDs = [];

  for (const presentation of presentations) {
    const presentationID = v4();
    presentationIDs.push(presentationID);
    presentationStatus.set(presentationID, {
      status: "processing",
      timestamp: Date.now(),
    });
  }

  const presentationIDsWritten = await setPresentationIDsAndPlayersFromRoundID(
    presentationIDs,
    playersAndTopics,
    roundID,
    accountID
  );

  if (!presentationIDsWritten) {
    if (!roundCreated) {
      return res
        .status(500)
        .json({
          message: "Presentation ID could not be written for round ID",
        })
        .send();
    }
  }

  console.log(presentationIDs);
  console.log(presentationStatus);
  console.log(roundID);
  res.send({ url: "/lobby?gameMode=1&roundID=" + roundID });

  //Background process:
  try {
    for (let i = 0; i < presentations.length; i++) {
      const presentationID = presentationIDs[i];
      const topic = presentations[i].topic;
      const contentWithoutImages = await fetchSlides(
        topic,
        presentationLanguage
      );
      const content = await insertImages(contentWithoutImages);
      const successful = await saveSlides(presentationID, content, topic);

      if (!successful) {
        presentationStatus.set(presentationID, {
          status: "error",
          message: "Fehler beim Speichern der Präsentation",
          timestamp: Date.now(),
        });
      }

      presentationStatus.set(presentationID, {
        status: "completed",
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Error while fetching and saving slides:", error);
    if (presentationID) {
      presentationStatus.set(presentationID, {
        status: "error",
        message: "Fehler beim Generieren der Präsentation",
        timestamp: Date.now(),
      });
    }
  }
});

app.get("/user", requireAuth, async (req, res) => {
  const rounds = await getRoundsFromAccountID(req.user.id);
  res.send(eta.render("account", { user: req.user, rounds: rounds }));
});

// Startseite Route (aktualisiert)
app.get("/", (req, res) => {
  res.send(eta.render("homepage", { user: req.user }));
});

// Landing Page Route (aktualisiert)
app.get("/main", (req, res) => {
  res.send(eta.render("dashboardNew", { user: req.user }));
});

app.get("/multi", requireAuth, (req, res) => {
  res.send(eta.render("multiplayerModeChoice", { user: req.user }));
});

app.get("/1-device-mode", requireAuth, (req, res) => {
  res.send(eta.render("1devicemode", { user: req.user }));
});

app.get("/create-lobby", async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }

  console.log("User creating lobby:", req.user);

  try {
    // Erstelle IMMER eine neue Lobby (keine bestehende Lobby-ID)
    const lobbyId = v4();
    const playerName = req.query.name || req.user.email.split("@")[0];
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const joinUrl = `${baseUrl}/join?id=${lobbyId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);
    const userId = req.user.id || req.user.email || v4();

    console.log("Creating new lobby with userId:", userId);
    console.log("Lobby ID:", lobbyId);
    console.log("Player name:", playerName);

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

    // Rendere die Lobby-Seite als HOST
    res.send(
      eta.render("lobby", {
        user: req.user,
        userId: userId,
        userName: playerName,
        lobbyId: lobbyId,
        qrCode: qrCodeDataUrl,
        joinUrl: joinUrl,
        isHost: true, // IMMER Host bei create-lobby
        playerName: playerName,
        players: playersList,
        lobbyDetails: lobbyResult || {},
      })
    );
  } catch (error) {
    console.error("Fehler beim Erstellen der Lobby:", error);
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
    if (!data) {
      console.log("Hier!!!!");
      return res.send(
        eta.render("error-page", {
          message: "The presentation does not exist or is still generating.",
        })
      );
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

app.get("/initiateGeneration", requireAuth, async (req, res) => {
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
      presentationStatus.set(presentationID, {
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
        presentationStatus.set(presentationID, {
          status: "error",
          message: "Fehler beim Speichern der Präsentation",
          timestamp: Date.now(),
        });
        return;
      }

      presentationStatus.set(presentationID, {
        status: "completed",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error while fetching and saving slides:", error);
      if (presentationID) {
        presentationStatus.set(presentationID, {
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

app.post("/checkGenerationStatus", requireAuth, (req, res) => {
  const presentationID = req.body.presentationID;
  if (!presentationID || !validator.isUUID(presentationID)) {
    return res
      .status(400)
      .json({ status: "error", message: "Ungültige Präsentations-ID(s)" });
  }

  const status = presentationStatus.get(presentationID);
  if (!status) {
    return res
      .status(404)
      .json({ status: "error", message: "Präsentation nicht gefunden" });
  }

  res.json(status);
});

app.get("/lobby", requireAuth, async (req, res) => {
  const gameMode = req.query.gameMode;
  const roundID = req.query.roundID;

  console.log(gameMode, roundID);

  if (!gameMode || !roundID || !validator.isUUID(roundID)) {
    return res.redirect("/");
  }

  // TODO: GameMode behandeln...

  // TODO: Verifizieren, dass die Round zum User gehört

  /*const verifyUserRoundRelation = await fetch ("/verifyUserRoundRelation", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userID: req.user.id,
            gameMode: gameMode,
            roundID: roundID
        })
    });

    if (!verifyUserRoundRelation || !verifyUserRoundRelation.ok) {
        return res.status(500).send(
            eta.render("error-page", {
                message: "Fehler beim Abrufen der Präsentationen",
            })
        );
    }*/

  const presentationIDs = await getPresentationIDsFromRoundID(roundID);
  let players = [];
  for (const presentationID of presentationIDs) {
    const player = await fetchPlayerName(presentationID);
    players.push(player);
  }

  if (!presentationIDs || !Array.isArray(presentationIDs)) {
    return res.status(500).send(
      eta.render("error-page", {
        message: "Fehler beim Abrufen der Präsentationen",
      })
    );
  }

  console.log(players);
  return res.send(
    eta.render("generation-status-multiplayer", {
      presentationIDs: presentationIDs,
      players: players,
    })
  );
});

app.post("/verifyUserRoundRelation", async (req, res) => {
  //...
  return true;
});

// Cleanup alte Status-Einträge alle 30 Minuten
setInterval(() => {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  for (const [id, status] of presentationStatus.entries()) {
    if (status.timestamp && status.timestamp < thirtyMinutesAgo) {
      presentationStatus.delete(id);
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

// Supabase-Konfiguration für Client bereitstellen
app.get("/api/supabase-config", (req, res) => {
  res.json({
    url: `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_API_KEY,
  });
});

// Chat-API für Fallback (optional, da Realtime das übernimmt)
app.post("/api/chat", async (req, res) => {
  try {
    const { lobbyId, userId, userName, message, isHost } = req.body;

    if (!lobbyId || !userId || !userName || !message) {
      return res.status(400).json({ error: "Fehlende Parameter" });
    }

    // Optional: Chat-Nachricht in Datenbank speichern
    // const result = await sendChatMessage(lobbyId, userId, message);

    res.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Verarbeiten der Chat-Nachricht:", error);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// Slide-Change API für Fallback (optional, da Realtime das übernimmt)
app.post("/api/slideChange", async (req, res) => {
  try {
    const { lobbyId, slideIndex } = req.body;

    if (!lobbyId || typeof slideIndex !== "number") {
      return res.status(400).json({ error: "Ungültige Parameter" });
    }

    // Optional: Slide-Index in Datenbank speichern

    res.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Verarbeiten der Slide-Änderung:", error);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// API-Endpunkt für Lobby-Aktionen (für Beitreten zur Lobby)
app.post("/api/lobby/:lobbyId/action", async (req, res) => {
  try {
    const { lobbyId } = req.params;
    const { action, data } = req.body;

    switch (action) {
      case "joinLobby":
        const { userId, userName } = data;
        console.log(
          `API: User ${userId} (${userName}) trying to join lobby ${lobbyId}`
        );

        const joinResult = await joinLobby(lobbyId, userId, userName);
        console.log("API: Join result:", joinResult);

        if (joinResult && joinResult.success) {
          const players = await getLobbyPlayers(lobbyId);
          console.log("API: Players after join:", players);

          res.json({ success: true, players, player: joinResult.player });
        } else {
          const errorMsg =
            joinResult?.error || "Unbekannter Fehler beim Beitreten";
          console.error("API: Join failed:", errorMsg);
          res.status(400).json({ success: false, error: errorMsg });
        }
        break;

      default:
        res.status(400).json({ error: "Unbekannte Aktion" });
    }
  } catch (error) {
    console.error("Fehler bei Lobby-Aktion:", error);
    res.status(500).json({ error: "Serverfehler" });
  }
});

const PORT = process.env.PORT || 8080;

// Funktion zur Serverstart mit Port-Fallback
function startServer(port) {
  try {
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/`);
    });
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      console.warn(
        `Port ${port} bereits in Verwendung, versuche Port ${port + 1}`
      );
      startServer(port + 1);
    } else {
      console.error("Serverfehler:", error);
    }
  }
}

// Starte den HTTP-Server mit automatischer Port-Fallback-Funktion
startServer(PORT);

// Exportiere den Express-Handler für Vercel
export default app;
