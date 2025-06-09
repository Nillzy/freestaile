-- Erweiterte Multiplayer-Tabellen für dein bestehendes System

-- Erweitere die bestehende Lobbys-Tabelle (falls noch nicht vorhanden)
ALTER TABLE "Lobbys" ADD COLUMN IF NOT EXISTS current_slide INTEGER DEFAULT 1;
ALTER TABLE "Lobbys" ADD COLUMN IF NOT EXISTS game_mode TEXT DEFAULT 'presentation';
ALTER TABLE "Lobbys" ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 10;

-- Erweitere die bestehende LobbyPlayers-Tabelle (falls noch nicht vorhanden)  
ALTER TABLE "LobbyPlayers" ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE "LobbyPlayers" ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT false;

-- Chat-Nachrichten Tabelle
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id UUID REFERENCES "Lobbys"(id) ON DELETE CASCADE,
  player_id UUID REFERENCES "LobbyPlayers"(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat', -- 'chat', 'system', 'game'
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Präsentations-Folien für Lobbys
CREATE TABLE IF NOT EXISTS lobby_slides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id UUID REFERENCES "Lobbys"(id) ON DELETE CASCADE,
  slide_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  slide_type TEXT DEFAULT 'presentation', -- 'presentation', 'question', 'karaoke'
  options JSONB, -- Für Multiple-Choice-Fragen oder andere Optionen
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spieler-Antworten für interaktive Folien
CREATE TABLE IF NOT EXISTS player_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id UUID REFERENCES "Lobbys"(id) ON DELETE CASCADE,
  player_id UUID REFERENCES "LobbyPlayers"(id) ON DELETE CASCADE,
  slide_id UUID REFERENCES lobby_slides(id) ON DELETE CASCADE,
  answer TEXT,
  points INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game Events für Realtime-Updates
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id UUID REFERENCES "Lobbys"(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'slide_change', 'game_start', 'game_end', 'player_join', 'player_leave'
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indizes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_lobby_id ON chat_messages(lobby_id);
CREATE INDEX IF NOT EXISTS idx_lobby_slides_lobby_id ON lobby_slides(lobby_id);
CREATE INDEX IF NOT EXISTS idx_player_answers_lobby_id ON player_answers(lobby_id);
CREATE INDEX IF NOT EXISTS idx_game_events_lobby_id ON game_events(lobby_id);

-- RLS (Row Level Security) Policies
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- Policies für Chat-Nachrichten (alle Lobby-Mitglieder können lesen/schreiben)
CREATE POLICY "Lobby members can view chat messages" ON chat_messages
  FOR SELECT USING (
    lobby_id IN (
      SELECT lobby_id FROM "LobbyPlayers" 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Lobby members can insert chat messages" ON chat_messages
  FOR INSERT WITH CHECK (
    lobby_id IN (
      SELECT lobby_id FROM "LobbyPlayers" 
      WHERE user_id = auth.uid()
    )
  ); 