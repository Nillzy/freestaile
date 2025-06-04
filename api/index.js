import express from "express";
import path from "node:path";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Eta } from "eta";
import { JSDOM } from "jsdom";
import {} from 'dotenv/config'
import validator from 'validator';
import cookieParser from 'cookie-parser';
import { v4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import { authMiddleware, requireAuth } from './middleware/auth.js';
import favicon from 'serve-favicon';
//import { validateRevealSlides } from "./revealValidator.js";
//import { exampleUsage, testInvalidSlides } from "./revealValidatorExample.js";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const eta = new Eta({ views: path.join(__dirname, "../public") });

app.use(favicon(path.join(__dirname, '../public/assets/favicon.ico')));

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
app.use('/api', express.static(path.join(__dirname, 'public'))); // Für /api/public Dateien
app.use(express.static(path.join(__dirname, '../public'))); // Für /public Dateien

// Logout-Route
app.post("/api/auth/logout", async (req, res) => {
    const token = req.cookies.session;
    if (token) {
        try {
            await supabase.auth.signOut(token);
        } catch (error) {
            console.error('Logout Fehler:', error);
        }
    }
    res.clearCookie('session');
    res.json({ message: 'Erfolgreich abgemeldet' });
});

// Login-Route (aktualisiert)
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "E-Mail und Passwort sind erforderlich"
        });
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(401).json({
                message: "Ungültige Anmeldedaten"
            });
        }

        // Setze den Session-Cookie
        res.cookie('session', data.session.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 Stunden
        });

        res.json({
            message: "Erfolgreich angemeldet",
            user: data.user
        });
    } catch (error) {
        console.error("Login-Fehler:", error);
        res.status(500).json({
            message: "Ein Fehler ist aufgetreten"
        });
    }
});

// Register-Route
app.post("/api/auth/register", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "E-Mail und Passwort sind erforderlich"
        });
    }

    // E-Mail Validierung
    if (!validator.isEmail(email)) {
        return res.status(400).json({
            message: "Ungültige E-Mail-Adresse"
        });
    }

    // Passwort Validierung
    if (password.length < 8) {
        return res.status(400).json({
            message: "Passwort muss mindestens 8 Zeichen lang sein"
        });
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${req.protocol}://${req.get('host')}/`
            }
        });

        if (error) {
            if (error.message.includes('already registered')) {
                return res.status(400).json({
                    message: "Diese E-Mail-Adresse ist bereits registriert"
                });
            }
            return res.status(400).json({
                message: error.message
            });
        }

        res.json({
            message: "Registrierung erfolgreich. Bitte bestätigen Sie Ihre E-Mail-Adresse.",
            user: data.user
        });
    } catch (error) {
        console.error("Registrierungs-Fehler:", error);
        res.status(500).json({
            message: "Ein Fehler ist aufgetreten"
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
    setTimeout( () => {
        res.send({ url: "/lobby?gameMode=1&roundID=" + roundID });
    }, 500);

    //Background process:
    for (let i = 0; i < presentations.length; i++) {
        try {
            const presentationID = presentationIDs[i];
            const topic = presentations[i].topic;
            const contentWithoutImages = await fetchSlides(topic, presentationLanguage);
            const content = await insertImages(contentWithoutImages);
            const successful = await saveSlides(presentationID, content, topic, roundID, accountID);

            if (!successful) {
                const success = await setGenerationStatus(presentationID, 'error', req.user.id);
                if (!success) {
                    return res.status(500).json({
                        message: "Generation status could not be written."
                    }).send();
                }
            }

            setTimeout(async () => {
                const success = await setGenerationStatus(presentationID, 'completed', req.user.id);
                if (!success) {
                    return res.status(500).json({
                        message: "Generation status could not be written."
                    }).send();
                }
            }, 500);
        } catch (error) {
            const presentationID = presentationIDs[i];
            console.error("Error while fetching and saving slides:", error);

            const success = await setGenerationStatus(presentationID, 'error', req.user.id);
            if (!success) {
                return res.status(500).json({
                    message: "Generation status could not be written."
                }).send();
            }
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

// Error Page Route (aktualisiert)
app.get("/error-page", (req, res) => {
    res.send(eta.render("error-page", {
        user: req.user,
        message: req.query.message
    }));
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
          console.log("Hier!!!!");
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

    const gameMode = req.query.gameMode;
    const roundID = req.query.roundID;

    console.log(gameMode, roundID)

    if (!gameMode || !roundID || !validator.isUUID(roundID)) {
        return res.redirect('/');
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
    return res.send(eta.render("generation-status-multiplayer", {presentationIDs: presentationIDs, players: players}));
});

app.post("/verifyUserRoundRelation", async (req, res) => {
    //...
    return true;
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

function getRandomTopic() {
    const topicsPath = path.join(__dirname, 'topics.json');
    const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
    const topics = topicsData.powerpoint_karaoke_topics;
    const randomIndex = Math.floor(Math.random() * topics.length);
    return topics[randomIndex];
}

// Express handler for Vercel:
export default app;

