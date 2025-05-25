const express = require("express");
const app = express();
const path = require("node:path");
const Eta = require("eta").Eta;
const eta = new Eta({ views: path.join(__dirname, "public") });
const { JSDOM } = require("jsdom");
require("dotenv").config(); // Für Umgebungsvariablen
const validator = require("validator");
const cookieParser = require("cookie-parser");
const { validateRevealSlides } = require("./revealValidator");
const { exampleUsage, testInvalidSlides } = require("./revealValidatorExample");
const { v4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const { authMiddleware, requireAuth } = require("./middleware/auth");

const { fetchSlides } = require("./APIService.js");
const { fetchImages } = require("./APIService.js");
const { fetchPresentation } = require("./SupabaseService.js");
const { saveSlides } = require("./SupabaseService");

// Supabase Client für Backend-Authentifizierung
const supabase = createClient(
  `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
  process.env.SUPABASE_API_KEY
);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware); // Auth-Middleware für alle Routes
app.use(express.static("public"));

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

// Login-Seite Route (aktualisiert)
app.get("/login", (req, res) => {
  // Nur wenn bereits eingeloggt, zur Startseite weiterleiten
  if (req.user) {
    return res.redirect("/");
  }

  const registered = req.query.registered === "true";
  const error =
    req.query.error === "unauthorized"
      ? "Bitte melden Sie sich an, um fortzufahren."
      : null;

  res.send(
    eta.render("login", {
      user: null, // Explizit null setzen, da wir wissen, dass der User nicht eingeloggt ist
      registered,
      message: registered
        ? "Registrierung erfolgreich! Bitte bestätigen Sie Ihre E-Mail-Adresse und melden Sie sich dann an."
        : null,
      error,
    })
  );
});

// Registrierungs-Seite Route (aktualisiert)
app.get("/register", (req, res) => {
  // Nur wenn bereits eingeloggt, zur Startseite weiterleiten
  if (req.user) {
    return res.redirect("/");
  }
  res.send(eta.render("register", { user: null })); // Explizit null setzen
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
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
