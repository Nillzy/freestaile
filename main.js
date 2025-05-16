const express = require('express');
const app = express();
const path = require('node:path');
const Eta = require('eta').Eta;
const eta = new Eta({views: path.join(__dirname, 'public')});
require('dotenv').config(); // Für Umgebungsvariablen

const { fetchSlides } = require('./APIService.js');

app.use(express.static("public"));

app.get('/', (req, res) => {
    res.send(eta.render("landing-page", {}));
});

app.get('/present', (req, res) => {
    if (req.query.topic !== undefined) {
        fetchSlides(req.query.topic)
            .then(content => {
                res.send(eta.render("presentation-page", {topic: req.query.topic, content: content}));
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