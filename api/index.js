import express from "express";
import path from "node:path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Eta } from "eta";
import { JSDOM } from "jsdom";
import {} from 'dotenv/config'
import os from "os";
import favicon from "serve-favicon";
import validator from "validator";
import cookieParser from "cookie-parser";
import { v4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { authMiddleware, requireAuth } from "./middleware/auth.js";
import { fetchSlides, fetchImages } from "./APIService.js";
import {
  fetchPresentation,
  saveSlides,
  getPresentationIDsFromRoundID,
  createRound,
  setPresentationIDsAndPlayersFromRoundID,
  fetchPlayerName,
  getRoundsFromAccountID,
  checkGenerationStatus,
  setGenerationStatus
} from "./SupabaseService.js";
import {
  createLobby,
  joinLobby,
  getLobbyPlayers,
  getLobbyDetails,
  updateLobbyStatus,
  startGame,
  nextSlide,
  previousSlide,
  sendChatMessage,
  getChatMessages,
  saveLobbySlides,
  getLobbySlides,
  getCurrentSlide,
  updatePlayerScore,
  savePlayerAnswer,
  getScoreboard,
  getFullLobbyData,
  createLobbyWithCode,
  joinLobbyByCode,
} from "./SupabaseServiceMultiDeviceMode.js";
import QRCode from "qrcode";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const eta = new Eta({ views: path.join(__dirname, "../public") });

app.use(favicon(path.join(__dirname, "../public/assets/favicon.ico")));

// Express-Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));
app.use(authMiddleware); // Auth-Middleware für alle Routes

// Statische Dateien - Reihenfolge ist wichtig!
app.use("/api", express.static(path.join(__dirname, "public"))); // Für /api/public Dateien
app.use(express.static(path.join(__dirname, "../public"))); // Für /public Dateien

// Supabase Client für Backend-Authentifizierung
const supabase = createClient(
  `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
  process.env.SUPABASE_API_KEY
);

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

app.post('/api/auth/delete-account', requireAuth, async (req, res) => {
  const accountID = req.user.id;
  try {

    const { error: generationStatesError } = await supabase
        .from('GenerationStates')
        .delete()
        .eq('a_id', accountID);

    if (generationStatesError) {
      console.error('Fehler beim Löschen der Generation States:', generationStatesError);
      return res.status(500).json({ error: 'Fehler beim Löschen der Benutzerdaten' });
    }

    const { error: presentationsInRoundError } = await supabase
        .from('Presentations_in_Round')
        .delete()
        .eq('a_id', accountID);

    if (presentationsInRoundError) {
      console.error('Fehler beim Löschen der Präsentationen:', presentationsInRoundError);
      return res.status(500).json({ error: 'Fehler beim Löschen der Benutzerdaten' });
    }

    const { error: presentationsError } = await supabase
        .from('Presentations')
        .delete()
        .eq('a_id', accountID);

    if (presentationsError) {
      console.error('Fehler beim Löschen der Präsentationen:', presentationsError);
      return res.status(500).json({ error: 'Fehler beim Löschen der Benutzerdaten' });
    }

    // Lösche zuerst alle abhängigen Daten
    const { error: roundsError } = await supabase
        .from('Rounds')
        .delete()
        .eq('a_id', accountID);

    if (roundsError) {
      console.error('Fehler beim Löschen der Runden:', roundsError);
      return res.status(500).json({ error: 'Fehler beim Löschen der Benutzerdaten' });
    }

    // Lösche den Benutzer bei Supabase
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(accountID);

    if (deleteUserError) {
      console.error('Fehler beim Löschen des Supabase-Accounts:', deleteUserError);
      return res.status(500).json({ error: 'Fehler beim Löschen des Accounts' });
    }

    // Lösche den Session-Cookie
    res.clearCookie('session');

    res.status(200).json({ message: 'Account erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen des Accounts:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

app.post("/initiateGeneration", async (req, res) => {
  const presentationLanguage = /*req.body.presentationLanguage*/ 'en';
  const accountID = req.user.id;
  const presentations = req.body.presentations;
  const gameMode = parseInt(req.body.gameMode);
  console.log(presentations);

  if (presentations === undefined || presentations.length === 0) {
    return res.status(500).json({
      message: "Request not valid"
    }).send();
  }

  let playersAndTopics = [];

  for (let i = 0; i < presentations.length; i++) {
    if (presentations[i].topic.length < 3 || presentations[i].topic.length > 50) {
      return res.status(500).json({
        message: "Request not valid"
      }).send();
    } else if (presentations[i].topic === "//RANDOM//") {
      presentations[i].topic = getRandomTopic();
    }
    const playerAndTopic = { player: presentations[i].player, topic: presentations[i].topic };
    playersAndTopics.push(playerAndTopic);
  }

  const roundID = v4();

  const roundCreated = await createRound(roundID, req.user.id);

  if (!roundCreated) {
    return res.status(500).json({
      message: "Round could not be created"
    }).send();
  }

  let presentationIDs = [];

  for (const presentation of presentations) {
    const presentationID = v4();
    presentationIDs.push(presentationID);
  }

  const presentationIDsWritten = await setPresentationIDsAndPlayersFromRoundID(presentationIDs, playersAndTopics, roundID, accountID);

  if (!presentationIDsWritten) {
    if (!roundCreated) {
      return res.status(500).json({
        message: "Presentation ID could not be written for round ID"
      }).send();
    }
  }

  for (const presentationID of presentationIDs) {
    const success = await setGenerationStatus(presentationID, 'processing', req.user.id);
    if (!success) {
      return res.status(500).json({
        message: "Generation status could not be written."
      }).send();
    }
  }

  console.log(presentationIDs);
  console.log(roundID);

  switch (gameMode) {
    case 1:
      res.send({
        url: `/lobby?gameMode=${gameMode}&roundID=${roundID}`
      });
      break;

    case 2:
      res.send({
        url: `/lobby?gameMode=${gameMode}&roundID=${roundID}&lobbyId=${req.body.lobbyId}&userId=${req.body.userId}&userName=${req.body.userName}&isHost=${req.body.isHost}`
      });
      break;

    default:
      res.send({
        url: `/error-page?message=Falsche Parameter beim Initialisieren der Generierung`
      });
      break;
  }

  //Background process for slide generation:
  const generationPromises = presentations.map(async (presentation, i) => {
    const presentationID = presentationIDs[i];
    const topic = presentation.topic;

    try {
      const contentWithoutImages = await fetchSlides(topic, presentationLanguage);
      const content = await insertImages(contentWithoutImages);
      const successful = await saveSlides(presentationID, content, topic, roundID, accountID);

      if (!successful) {
        await setGenerationStatus(presentationID, 'error', accountID);
        return;
      }

      setTimeout(async () => {
        await setGenerationStatus(presentationID, 'completed', accountID);
      }, 500);

    } catch (error) {
      console.error("Error while fetching and saving slides:", error);
      await setGenerationStatus(presentationID, 'error', accountID);
    }
  });

  await Promise.all(generationPromises);

});


  /*app.post("/initiateGeneration", async (req, res) => {
    const presentationLanguage = 'en';
    const accountID = req.user.id;
    const presentations = req.body.presentations;
    const gameMode = parseInt(req.body.gameMode);
    console.log(presentations);

    if (presentations === undefined || presentations.length === 0) {
      return res.status(500).json({
        message: "Request not valid"
      }).send();
    }

    let playersAndTopics = [];

    for (let i = 0; i < presentations.length; i++) {
      if (presentations[i].topic.length < 3 || presentations[i].topic.length > 50) {
        return res.status(500).json({
          message: "Request not valid"
        }).send();
      } else if (presentations[i].topic === "//RANDOM//") {
        presentations[i].topic = getRandomTopic();
      }
      const playerAndTopic = { player: presentations[i].player, topic: presentations[i].topic };
      playersAndTopics.push(playerAndTopic);
    }

    const roundID = v4();

    const roundCreated = await createRound(roundID, req.user.id);

    if (!roundCreated) {
      return res.status(500).json({
        message: "Round could not be created"
      }).send();
    }

    let presentationIDs = [];

    for (const presentation of presentations) {
      const presentationID = v4();
      presentationIDs.push(presentationID);
    }

    const presentationIDsWritten = await setPresentationIDsAndPlayersFromRoundID(presentationIDs, playersAndTopics, roundID, accountID);

    if (!presentationIDsWritten) {
      if (!roundCreated) {
        return res.status(500).json({
          message: "Presentation ID could not be written for round ID"
        }).send();
      }
    }

    for (const presentationID of presentationIDs) {
      const success = await setGenerationStatus(presentationID, 'processing', req.user.id);
      if (!success) {
        return res.status(500).json({
          message: "Generation status could not be written."
        }).send();
      }
    }

    console.log(presentationIDs);
    console.log(roundID);

    //Background process:
    for (let i = 0; i < presentations.length; i++) {

      const options = {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ presentationID: presentationIDs[i], topic: presentations[i].topic, roundID: roundID, accountID: accountID, presentationLanguage: presentationLanguage })
      }
      fetch(`${process.env.PROTOCOL}://${req.headers.host}/generate`, options);               // Absichtlich kein await!
      console.log("Request an " + `${process.env.PROTOCOL}://${req.headers.host}/generate` + "weitergegeben");

    }

    if (gameMode === 1) {
      res.send({
        url: `/lobby?gameMode=${gameMode}&roundID=${roundID}`
      });
    } else if (gameMode === 2) {
      res.send({
        url: `/lobby?gameMode=${gameMode}&roundID=${roundID}&lobbyId=${req.body.lobbyId}&userId=${req.body.userId}&userName=${req.body.userName}&isHost=${req.body.isHost}`
      });
    } else {
      res.send({
        url: `/error-page?message=Falsche Parameter beim Initialisieren der Generierung`
      })
    }

  });*/

// Da Vercel API-Requests nicht aufrechterhält, bringt die Auslagerung nichts
/*app.post("/generate", async (req, res) => {
  try {
  //TODO: Ganze Methode 50 Sekunden und dann Selbstaufruf
    const presentationID = req.body.presentationID;
    const topic = req.body.topic;
    const presentationLanguage = req.body.presentationLanguage;
    const roundID = req.body.roundID;
    const accountID = req.body.accountID;
    const contentWithoutImages = await fetchSlides(topic, presentationLanguage);
    const content = await insertImages(contentWithoutImages);
    const successful = await saveSlides(presentationID, content, topic, roundID, accountID);

    if (!successful) {
      const success = await setGenerationStatus(presentationID, 'error', accountID);
      if (!success) {
        return res.status(500).json({
          message: "Generation status could not be written."
        }).send();
      }
    }

    setTimeout(async () => {
      const success = await setGenerationStatus(presentationID, 'completed', accountID);
      if (!success) {
        return res.status(500).json({
          message: "Generation status could not be written."
        }).send();
      }
    }, 500);

    res.send(true);
  } catch (error) {
    const presentationID = req.body.presentationID;
    console.error("Error while fetching and saving slides:", error);

    const success = await setGenerationStatus(presentationID, 'error', accountID);
    if (!success) {
      return res.status(500).json({
        message: "Generation status could not be written."
      }).send();
    }
    res.send(false);
  }
});*/

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

app.get("/multi-device-mode", async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }

  console.log("User creating lobby:", req.user);

  try {
    // Erstelle IMMER eine neue Lobby (keine bestehende Lobby-ID)
    const lobbyId = v4();
    const playerName = req.query.name || req.user.email.split("@")[0];
    const host = req.get("host");
    const realHost = host.includes("localhost") ? host.replace("localhost", getLocalIP()) : host;
    const joinUrl = `${req.protocol}://${realHost}/join?id=${lobbyId}`;
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
        isHost: true, // IMMER Host bei /multi-device-mode
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
    return res.redirect("/");
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

app.get("/lobby-multidevicemode", async (req, res) => {
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
    const host = req.get("host");
    const realHost = host.includes("localhost") ? host.replace("localhost", getLocalIP()) : host;
    const joinUrl = `${req.protocol}://${realHost}/join?id=${lobbyId}`;
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

app.get("/present", (req, res) => {
  if (req.query.topic !== undefined && req.query.topic.length >= 3 && req.query.topic.length <= 50 && req.query.presentationLanguage !== undefined) {
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
          return res.status(500).send(
              eta.render("error-page", {
                message: "Fehler beim Abrufen der Präsentation",
              })
          );
        });
  } else {
    return res.redirect("/");
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
  let presentationID = req.query.presentationID
  if (presentationID === undefined || presentationID === "" || !validator.isUUID(presentationID)) {
    res.redirect("/")
  } else {
    const data = await fetchPresentation(presentationID);

    if (!data) {
      return res.send(eta.render("error-page", {
        message: "The presentation does not exist or is still generating.",
      }));
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

// Nicht mehr benötigt
/*app.get("/initiateGeneration", requireAuth, async (req, res) => {
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
});*/

app.post("/checkGenerationStatus", requireAuth, async (req, res) => {
  const presentationID = req.body.presentationID;

  if (!presentationID || !validator.isUUID(presentationID)) {
    return res.status(400).json({ status: 'error', message: 'Invalid request data' });
  }

  const generationStatus = await checkGenerationStatus(presentationID);

  console.log(generationStatus);

  if (!generationStatus || !generationStatus.status) {
    return res.json({ status: "error", message: 'Error fetching generation status' });
  }

  return res.json(generationStatus);
});

app.get("/lobby", requireAuth, async (req, res) => {

  const gameMode = parseInt(req.query.gameMode, 10);
  const roundID = req.query.roundID;

  if (isNaN(gameMode) || (gameMode !== 1 && gameMode !== 2) || !roundID || !validator.isUUID(roundID)) {
    return res.status(500).send(
        eta.render("error-page", {
          message: "Ungültige Anfrage: gameMode: " + (gameMode || undefined) + ", roundID: " + (roundID || undefined),
        })
    );
  }

  const presentationIDs = await getPresentationIDsFromRoundID(roundID);

  if (!presentationIDs) {
    return res.status(500).send(
        eta.render("error-page", {
          message: "Datenbank-Fehler beim Abrufen der Runden-Informationen",
        })
    );
  } else if (presentationIDs === "INVALID_ROUND") {
    return res.status(500).send(
        eta.render("error-page", {
          message: "Ungültige Rundeninformationen",
        })
    );
  }
  let players = [];
  for (const presentationID of presentationIDs) {
    const player = await fetchPlayerName(presentationID)
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
  if (gameMode === 1) {             // 1-Device-Mode
    return res.send(eta.render("generation-status-multiplayer", {
      presentationIDs: presentationIDs,
      players: players
    }));
  } else {                          // Multi-Device-Mode
    const { lobbyId, userId, userName, isHost } = req.query;
    if (!lobbyId || !userId || !userName || isHost === undefined) {
      return res.redirect("/error-page?message=Fehlende Parameter für das Match");
    }

    const players2 = await getLobbyPlayers(lobbyId);

    const data = {
      lobbyId: lobbyId,
      userId: userId,
      userName: userName,
      isHost: isHost,
      presentationIDs: presentationIDs,
      players: players,
      players2: players2
    }

    return res.send(eta.render("generation-status-multiplayer-multidevice", data));
  }

});

app.get("/chat", async (req, res) => {
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

    res.send(
        eta.render("chat", {
          lobbyId: lobbyId,
          userId: userId,
          userName: userName,
          isHost: isHost === "true",
          players: players || [],
        })
    );
  } catch (error) {
    console.error("Fehler beim Laden der Match-Seite:", error);
    res.redirect("/error-page?message=Fehler beim Laden der Match-Seite");
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

// ===== ERWEITERTE LOBBY-ROUTES =====

// Match/Präsentations-Route mit Reveal.js und Chat
app.get("/present3", async (req, res) => {
  //TODO: if undefined redirect
  try {
    const { presentationID, lobbyId, userId, userName, isHost } = req.query;

    if ( !presentationID || !lobbyId || !userId || !userName || isHost === undefined) {
      return res.redirect("/error-page?message=Fehlende Parameter für Match");
    }

    const players = await getLobbyPlayers(lobbyId);

    const data = await fetchPresentation(presentationID);

    res.send(
      eta.render("match2", {
        topic: data.topic,
        content: data.content,
        lobbyId: lobbyId,
        userId: userId,
        userName: userName,
        isHost: isHost === "true",
        players: players || []
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

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

function getRandomTopic() {
  const topicsPath = path.join(__dirname, 'topics.json');
  const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
  const topics = topicsData.powerpoint_karaoke_topics;
  const randomIndex = Math.floor(Math.random() * topics.length);
  return topics[randomIndex];
}

if (process.env.IS_LOCAL) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`Listening at http://localhost:${PORT}`);
  });
}

// Exportiere den Express-Handler für Vercel
export default app;
