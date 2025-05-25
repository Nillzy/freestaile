import express from "express";
import path from "node:path";
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
import { fetchPresentation, saveSlides } from "./SupabaseService.js";

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
        return res.redirect('/');
    }
    res.send(eta.render("multiplayer", { user: req.user }));
});

// Error Page Route (aktualisiert)
app.get("/error-page", (req, res) => {
    res.send(eta.render("error-page", {
        user: req.user,
        message: req.query.message
    }));
});

// Beispiel für eine geschützte Route
app.get("/dashboard", requireAuth, (req, res) => {
    res.send(eta.render("dashboard", { user: req.user }));
});

app.get("/present", (req, res) => {
  if (req.query.topic !== undefined || req.query.presentationLanguage !== undefined) {
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
  let presentationID = req.query.presentationID
  if (presentationID === undefined || presentationID === "" || !validator.isUUID(presentationID)) {
    res.redirect("/")
  } else {
      const data = await fetchPresentation(presentationID);

      if (!data) {
          eta.render("error-page", {
              message: "Fehler beim Abrufen und Speichern der Präsentation",
          })
          return
      }

      console.log(data);

      res.send(
          eta.render("presentation-page", {
              topic: data.topic,
              content: data.content,
          })
      );
  }
})

const presentationStatuses = new Map();

app.get("/initiateGeneration", async (req, res) => {
    let topic = req.query.presentationID.toString;
    let presentationLanguage = req.query.presentationID.toString();
    if (topic !== undefined || topic !== "" || presentationLanguage !== undefined || presentationLanguage !== "") {
        try {
            const presentationID = v4();
            presentationStatuses.set(presentationID, { 
                status: 'processing',
                timestamp: Date.now()
            });
            
            res.send(eta.render("generation-status", {
                presentationID: presentationID
            }));

            //Background process:
            const topic = req.query.topic;
            const presentationLanguage = req.query.presentationLanguage;
            const contentWithoutImages = await fetchSlides(topic, presentationLanguage);
            const content = await insertImages(contentWithoutImages);
            const successful = await saveSlides(presentationID, content, topic);

            if (!successful) {
                presentationStatuses.set(presentationID, { 
                    status: 'error', 
                    message: 'Fehler beim Speichern der Präsentation',
                    timestamp: Date.now()
                });
                return;
            }

            presentationStatuses.set(presentationID, { 
                status: 'completed',
                timestamp: Date.now()
            });

        } catch (error) {
            console.error("Error while fetching and saving slides:", error);
            if (presentationID) {
                presentationStatuses.set(presentationID, { 
                    status: 'error', 
                    message: 'Fehler beim Generieren der Präsentation',
                    timestamp: Date.now()
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
        return res.status(400).json({ status: 'error', message: 'Ungültige Präsentations-ID' });
    }

    const status = presentationStatuses.get(presentationID);
    if (!status) {
        return res.status(404).json({ status: 'error', message: 'Präsentation nicht gefunden' });
    }

    res.json(status);
});

// Cleanup alte Status-Einträge alle 30 Minuten
setInterval(() => {
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    for (const [id, status] of presentationStatuses.entries()) {
        if (status.timestamp && status.timestamp < thirtyMinutesAgo) {
            presentationStatuses.delete(id);
        }
    }
}, 30 * 60 * 1000);

/*
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
*/


// Exportiere den Express-Handler für Vercel
export default app;
