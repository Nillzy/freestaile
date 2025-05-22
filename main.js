const express = require("express");
const app = express();
const path = require("node:path");
const Eta = require("eta").Eta;
const eta = new Eta({ views: path.join(__dirname, "public") });
const { JSDOM } = require("jsdom");
require("dotenv").config(); // Für Umgebungsvariablen
const validator = require('validator');
const { validateRevealSlides } = require("./revealValidator");
const { exampleUsage, testInvalidSlides } = require("./revealValidatorExample");
const { v4 } = require('uuid');

const { fetchSlides } = require("./APIService.js");
const { fetchImages } = require("./APIService.js");
const { fetchPresentation } = require("./SupabaseService.js");
const {saveSlides} = require("./SupabaseService");

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send(eta.render("Home-Page", {}));
});

app.get("/main", (req, res) => {
  res.send(eta.render("landing-page", {}))
})

app.get("/error-page", (req, res) => {
    res.send(eta.render("error-page", {message: req.query.message}));
})

app.get("/present", (req, res) => {
  if (req.query.topic !== undefined || req.query.language !== undefined) {
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
    if (req.query.topic !== undefined || req.query.language !== undefined) {
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
