const express = require("express");
const app = express();
const path = require("node:path");
const Eta = require("eta").Eta;
const eta = new Eta({ views: path.join(__dirname, "public") });
const { JSDOM } = require("jsdom");
require("dotenv").config(); // Für Umgebungsvariablen
const { validateRevealSlides } = require("./revealValidator");
const { exampleUsage, testInvalidSlides } = require("./revealValidatorExample");

const { fetchSlides } = require("./APIService.js");
const { fetchImages } = require("./APIService.js");

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send(eta.render("Home-Page", {}));
});

app.get("/present", (req, res) => {
  if (req.query.topic !== undefined) {
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

  // Gib das aktualisierte HTML als String zurück
  return dom.serialize(); // alternativ: document.body.innerHTML
}
