const express = require('express');
const app = express();
const path = require('node:path');
const Eta = require('eta').Eta;
const eta = new Eta({views: path.join(__dirname, 'public')});
require('dotenv').config(); // Für Umgebungsvariablen

app.use(express.static("public"));

app.get('/', (req, res) => {
    res.send(eta.render("landing-page", {}));
});

app.get('/present', (req, res) => {
    if (req.query.topic !== undefined) {
        fetchSlides(req.query.topic)
            .then(content => {
                res.send(eta.render("presentation-page", {content: content}));
            })
            .catch(error => {
                console.error('Error fetching slides:', error);
                res.status(500).send(eta.render("error-page", {
                    message: "Fehler beim Abrufen der Präsentation"
                }));
            });
    } else {
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

async function fetchSlides(topic) {
    /*const prompt = `Erstelle eine Präsentation zum Thema: ${topic}. Die Präsentation soll aus ca. 10 Folien mit prägnantem Inhalt bestehen. Generiere die Präsentation für RevealJS. Gib mir nicht den ganzen HTML-Code, sondern nur den Inhalt des Bodys. Der äußere div soll die class "container" haben und der innere div soll die class und id "presentation-container" haben. Antworte mit nichts anderem. Wenn du das Thema nicht verstehst oder du zu dem angegebenen Thema keine Präsentation erstellen möchtest, antworte einfach mit NO_SLIDE. Hier ist ein Beispiel: <div class="container">
      <div class="presentation-container" id="presentation-container">
        <section>
          <h2>Katzen vs. Hunde</h2>
          <ul>
            <li>Die große Debatte: Wer ist besser?</li>
            <li>Katzenfans sagen: Eleganz pur</li>
            <li>Hundefans sagen: Treue auf vier Pfoten</li>
            <li>Internet: beide gewinnen</li>
            <li>Lasst uns das mal mit Humor klären!</li>
          </ul>
        </section>
    
        <section>
          <h2>Team Katze 😼</h2>
          <ul>
            <li>Unabhängig – brauchen uns nicht</li>
            <li>Anmutig – echte Zen-Meister</li>
            <li>Internet-Superstars (Grumpy Cat, anyone?)</li>
            <li>Meistern die Kunst des Ignorierens</li>
            <li>Boxen sind bessere Wohnungen</li>
          </ul>
        </section>
    
        <section>
          <h2>Team Hund 🐶</h2>
          <ul>
            <li>Loyal bis zur letzten Keks-Krümel</li>
            <li>Witzige Zoomies inklusive</li>
            <li>Wachdienst und Kuscheltier in einem</li>
            <li>Sind nie beleidigt – nur begeistert</li>
            <li>Wissen immer, wer der beste Mensch ist: DU</li>
          </ul>
        </section>
    
        <section>
          <h2>Katzenlogik</h2>
          <ul>
            <li>"Ich schlafe jetzt. Auf deiner Tastatur."</li>
            <li>"Warum liegt da ein Glas? Jetzt nicht mehr."</li>
            <li>"Du arbeitest? Lustig, ich nicht."</li>
            <li>"Füttere mich. Nein, jetzt nicht."</li>
            <li>"Ich bin die Königin dieses Sofas."</li>
          </ul>
        </section>
    
        <section>
          <h2>Hundelogik</h2>
          <ul>
            <li>"Du warst kurz weg? Partyzeit!"</li>
            <li>"Was du isst, gehört auch mir."</li>
            <li>"Katzen? Sind das Spielzeuge?"</li>
            <li>"Ich bin groß. Ich bin Schoßhund."</li>
            <li>"Stöckchen = Lebensziel."</li>
          </ul>
        </section>
    
        <section>
          <h2>Revierverhalten</h2>
          <ul>
            <li>Katzen: Kratzbaum, Sofa, Wand – alles meins</li>
            <li>Hunde: Jeder Baum zählt</li>
            <li>Katzen markieren mit Stil</li>
            <li>Hunde eher mit... Duft</li>
            <li>Beide: Dein Bett gehört uns</li>
          </ul>
        </section>
    
        <section>
          <h2>Wachsamkeit</h2>
          <ul>
            <li>Hund: Wacht bei jedem Windhauch</li>
            <li>Katze: "Lass mich in Ruhe, ich meditiere."</li>
            <li>Hund: "ICH HAB WAS GEHÖRT!"</li>
            <li>Katze: "War nur dein Atem. Chill."</li>
            <li>Ergebnis: Hund bellt, Katze beobachtet</li>
          </ul>
        </section>
    
        <section>
          <h2>Belohnungssystem</h2>
          <ul>
            <li>Hund: Sitzt – bekommt Leckerli – freut sich wie verrückt</li>
            <li>Katze: Sitzt – betrachtet das Leckerli – geht weg</li>
            <li>Hund: Lob ist alles</li>
            <li>Katze: Du darfst mich loben – vielleicht</li>
            <li>Hund: "Ich tu’s für dich!" – Katze: "Ich tu’s, wenn ich will."</li>
          </ul>
        </section>
    
        <section>
          <h2>Internet-Könige</h2>
          <ul>
            <li>Katzen: Meme-Weltmeister</li>
            <li>Hunde: YouTube-Stars mit Herz</li>
            <li>Katzenvideos = 90% aller Klicks</li>
            <li>Hundecontent = Feel-Good-Garantie</li>
            <li>Fazit: Das Netz liebt sie beide!</li>
          </ul>
        </section>
    
        <section>
          <h2>Fazit</h2>
          <ul>
            <li>Beide Arten sind flauschige Legenden</li>
            <li>Katze = Stil und Coolness</li>
            <li>Hund = Liebe auf vier Pfoten</li>
            <li>Humor, Chaos und Zuneigung garantiert</li>
            <li>Warum entscheiden? Adoptiere beide!</li>
          </ul>
        </section>
      </div>
    </div>`;

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer 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`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "meta-llama/llama-4-maverick:free",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: prompt
                        }
                    ]
                }
            ]
        })
    };

    console.log(`${process.env.OPENROUTER_API_KEY}`);

    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`API returned status: ${response.status}`);
        }

        console.log(response);

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;

        if (!content || content.trim() === 'NO_SLIDE') {
            throw new Error("No slide content generated.");
        }

        return content;

    } catch (error) {
        console.error(error);
        throw error; // Fehler weiterleiten, damit er behandelt werden kann
    }*/
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const options = {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: `{"model":"meta-llama/llama-4-maverick:free","messages":[{"role":"user","content":[{"type":"text","text":"Erstelle eine Präsentation zum Thema: ${topic}. Die Präsentation soll aus ca. 10 Folien mit prägnantem Inhalt bestehen. Generiere die Präsentation für RevealJS. Gib mir nicht den ganzen HTML-Code, sondern nur den Inhalt des Bodys. Der äußerste div soll die class "container" haben, der nächste div soll die class und id "presentation-container" haben, der nächste div die class "reveal" und der innerste div die class "slides" . Antworte mit nichts anderem."}]}]}`
    };

    try {
        const response = await fetch(url, options);
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        console.log(content);
        return content;
    } catch (error) {
        console.error(error);
    }
}