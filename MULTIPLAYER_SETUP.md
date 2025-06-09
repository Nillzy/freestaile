# 🎮 Multiplayer-Setup Anleitung

Diese Anleitung erklärt, wie du die neue Multiplayer-Funktionalität in deinem FreestAIle-Projekt einrichtest.

## 📋 Übersicht der neuen Features

✅ **6-stelliger Join-Code System**  
✅ **Realtime-Chat mit Supabase**  
✅ **Lobby-Management mit Host/Player-Rollen**  
✅ **Slide-Synchronisation zwischen allen Teilnehmern**  
✅ **Scoreboard und Punktesystem**  
✅ **Game Events für Realtime-Updates**  
✅ **Responsive UI mit modernem Design**

## 🚀 Schritt 1: Supabase-Tabellen erstellen

Führe die SQL-Statements aus `sql/multiplayer_tables.sql` in deiner Supabase-Datenbank aus:

```bash
# In Supabase SQL Editor einfügen und ausführen
cat sql/multiplayer_tables.sql
```

### Neue Tabellen:

- `chat_messages` - Realtime-Chat
- `lobby_slides` - Präsentationsfolien pro Lobby
- `player_answers` - Spielerantworten für interaktive Folien
- `game_events` - Events für Realtime-Updates

### Erweiterte bestehende Tabellen:

- `Lobbys` - Neue Spalten: `current_slide`, `game_mode`, `max_players`, `code`
- `LobbyPlayers` - Neue Spalten: `score`, `is_ready`

## 🔧 Schritt 2: Environment-Variablen prüfen

Stelle sicher, dass diese Variablen in deiner `.env`-Datei gesetzt sind:

```env
SUPABASE_USER_ID=dein-supabase-projekt-id
SUPABASE_API_KEY=dein-service-role-key
SUPABASE_ANON_KEY=dein-anon-public-key
```

## 📦 Schritt 3: Dependencies prüfen

Die benötigten Packages sind bereits in deiner `package.json`:

```json
{
  "@supabase/supabase-js": "^2.49.8",
  "uuid": "^11.1.0"
}
```

## 🎯 Schritt 4: Neue API-Endpunkte

Die folgenden neuen API-Endpunkte wurden hinzugefügt:

### Host & Join

- `POST /api/multiplayer/host` - Neue Lobby erstellen
- `POST /api/multiplayer/join` - Lobby beitreten

### Lobby-Management

- `GET /api/multiplayer/lobby/:lobbyId/full` - Vollständige Lobby-Daten
- `POST /api/multiplayer/lobby/:lobbyId/start` - Spiel starten
- `POST /api/multiplayer/lobby/:lobbyId/next-slide` - Nächste Folie
- `POST /api/multiplayer/lobby/:lobbyId/previous-slide` - Vorherige Folie

### Chat

- `POST /api/multiplayer/lobby/:lobbyId/chat` - Chat-Nachricht senden
- `GET /api/multiplayer/lobby/:lobbyId/chat` - Chat-Nachrichten abrufen

### Folien & Scoring

- `POST /api/multiplayer/lobby/:lobbyId/slides` - Folien speichern
- `GET /api/multiplayer/lobby/:lobbyId/slides` - Folien abrufen
- `GET /api/multiplayer/lobby/:lobbyId/current-slide` - Aktuelle Folie
- `GET /api/multiplayer/lobby/:lobbyId/scoreboard` - Scoreboard
- `POST /api/multiplayer/lobby/:lobbyId/answer` - Spielerantwort speichern

## 🌐 Schritt 5: Neue Frontend-Routes

### Neue Seiten:

- `/multiplayer-lobby/:lobbyId` - Erweiterte Lobby mit Chat
- `/multiplayer-presentation/:lobbyId` - Synchronisierte Präsentation

### Erweiterte Seiten:

- `/multi` - Jetzt mit Host/Join-Buttons

## 🎮 Schritt 6: Verwendung

### Als Host:

1. Gehe zu `/multi`
2. Klicke auf "Spiel hosten"
3. Du erhältst einen 6-stelligen Code (z.B. `ABC123`)
4. Teile den Code mit anderen Spielern
5. Starte das Spiel, wenn alle bereit sind

### Als Spieler:

1. Gehe zu `/multi`
2. Klicke auf "Spiel beitreten"
3. Gib den 6-stelligen Code ein
4. Gib deinen Namen ein
5. Warte auf den Spielstart

## 🔄 Schritt 7: Realtime-Features

### Automatische Updates:

- **Spieler-Liste**: Neue Spieler erscheinen sofort
- **Chat**: Nachrichten in Echtzeit
- **Slide-Wechsel**: Alle sehen gleichzeitig die neue Folie
- **Spielstart**: Automatische Weiterleitung zur Präsentation

### Chat-Features:

- Normale Chat-Nachrichten
- System-Nachrichten (Spieler beigetreten, etc.)
- Realtime-Updates ohne Neuladen

## 🎨 Schritt 8: UI-Features

### Lobby-Ansicht:

- Großer 6-stelliger Code
- Spieler-Liste mit Scores
- Realtime-Chat
- Host-Kontrollen (Spiel starten, etc.)

### Präsentations-Ansicht:

- Synchronisierte Folien
- Host-Kontrollen (Vor/Zurück)
- Chat-Integration
- Scoreboard

## 🔧 Schritt 9: Anpassungen

### Eigene Folien hinzufügen:

```javascript
// In der Lobby als Host
const slides = [
  {
    content: "<h1>Meine Folie</h1>",
    type: "presentation",
  },
  {
    content: "<h2>Frage</h2><p>Was ist 2+2?</p>",
    type: "question",
    options: { answers: ["3", "4", "5"], correct: 1 },
  },
];

await fetch(`/api/multiplayer/lobby/${lobbyId}/slides`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slides }),
});
```

### Chat-Nachrichten senden:

```javascript
await fetch(`/api/multiplayer/lobby/${lobbyId}/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Hallo alle!",
    playerId: currentPlayerId,
  }),
});
```

## 🐛 Troubleshooting

### Häufige Probleme:

1. **Lobby nicht gefunden**

   - Prüfe, ob der Code korrekt eingegeben wurde
   - Codes sind case-sensitive (immer Großbuchstaben)

2. **Realtime-Updates funktionieren nicht**

   - Prüfe Supabase RLS-Policies
   - Stelle sicher, dass `SUPABASE_ANON_KEY` gesetzt ist

3. **Chat-Nachrichten erscheinen nicht**

   - Prüfe Browser-Konsole auf Fehler
   - Stelle sicher, dass die `chat_messages`-Tabelle existiert

4. **Spieler können nicht beitreten**
   - Prüfe, ob die Lobby voll ist (max. 10 Spieler)
   - Prüfe, ob das Spiel bereits gestartet wurde

## 📱 Mobile Unterstützung

Das UI ist vollständig responsive und funktioniert auf:

- Desktop-Browsern
- Tablets
- Smartphones

## 🔒 Sicherheit

- Alle API-Endpunkte erfordern Authentifizierung
- Host-Aktionen sind auf den Lobby-Ersteller beschränkt
- RLS-Policies schützen Chat-Nachrichten
- Input-Validierung für alle Formulare

## 🚀 Nächste Schritte

1. **Teste die Grundfunktionen**:

   - Lobby erstellen
   - Spieler hinzufügen
   - Chat testen
   - Spiel starten

2. **Erweitere nach Bedarf**:

   - Eigene Slide-Typen
   - Zusätzliche Game-Modi
   - Erweiterte Scoring-Logik

3. **Deploy und teile**:
   - Teste mit echten Nutzern
   - Sammle Feedback
   - Iteriere und verbessere

---

**🎉 Viel Spaß mit deinem neuen Multiplayer-System!**

Bei Fragen oder Problemen, schau in die Browser-Konsole oder die Server-Logs für detaillierte Fehlermeldungen.
