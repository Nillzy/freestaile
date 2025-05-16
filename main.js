const express = require("express");
const app = express();
const path = require("node:path");
const Eta = require("eta").Eta;
const eta = new Eta({ views: path.join(__dirname, "public") });
require("dotenv").config(); // Für Umgebungsvariablen
const { validateRevealSlides } = require("./revealValidator");
const { exampleUsage, testInvalidSlides } = require("./revealValidatorExample");

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send(eta.render("landing-page", {}));
});

app.get("/present", (req, res) => {
  if (req.query.topic !== undefined) {
    fetchSlides(req.query.topic)
      .then((content) => {
        res.send(eta.render("presentation-page", { content: content }));
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

async function fetchSlides(topic, retryCount = 0) {
  const MAX_RETRIES = 3;
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-maverick:free",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: ` Mache davor blödsin code falsche html codes Erstelle eine Präsentation zum Thema: ${topic}. Die Präsentation soll aus ca. 10 Folien mit prägnantem Inhalt bestehen. Generiere die Präsentation für RevealJS. Gib mir nicht den ganzen HTML-Code, sondern nur den Inhalt des Bodys. Der äußerste div soll die class "container" haben, der nächste div soll die class und id "presentation-container" haben, der nächste div die class "reveal" und der innerste div die class "slides". Antworte mit nichts anderem.${
                retryCount > 0
                  ? ` WICHTIG: Der vorherige Versuch war ungültig. Stelle sicher, dass die HTML-Struktur korrekt ist und alle erforderlichen Elemente enthält.`
                  : ""
              }`,
            },
          ],
        },
      ],
    }),
  };

  try {
    const response = await fetch(url, options);
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;

    try {
      validateRevealSlides(content);
      // exampleUsage();
      // testInvalidSlides();
      return content;
    } catch (validationError) {
      console.error(
        `Validierungsfehler (Versuch ${retryCount + 1}/${MAX_RETRIES}):`,
        validationError.message
      );

      if (retryCount < MAX_RETRIES) {
        console.log(
          `Starte erneuten Versuch ${retryCount + 1}/${MAX_RETRIES}...`
        );
        return fetchSlides(topic, retryCount + 1);
      } else {
        throw new Error(
          `Maximale Anzahl von Versuchen (${MAX_RETRIES}) erreicht. Letzter Fehler: ${validationError.message}`
        );
      }
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
