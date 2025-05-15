const express = require('express');
const app = express();

const path = require('node:path');

const Eta = require('eta').Eta;
const eta = new Eta({views: path.join(__dirname, 'public')});

app.use(express.static("public"));

app.get('/', (req, res) => {
    res.send(eta.render("landing-page", {}))
})

app.get('/present', (req, res) => {
    if (req.query.topic === undefined) {
        res.redirect('/');
    } else {
        res.send(eta.render("presentation-page", {topic: req.query.topic}));
    }
})

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});