import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
  process.env.SUPABASE_API_KEY
);

export async function fetchPresentation(presentationID) {
  const { data, error } = await supabase
    .from("Presentations")
    .select("topic, content")
    .eq("id", presentationID)
    .single();

  if (error || !data || !data.content) {
    return false;
  } else {
    return { topic: data.topic, content: data.content };
  }
}

export async function saveSlides(presentationID, content, topic) {
  const { data, error } = await supabase
    .from("Presentations")
    .insert([{ id: presentationID, content: content, topic: topic }])
    .select();

  if (!error) {
    return true;
  } else {
    console.error("Presentation could not be saved. Reason: " + error.message);
    return false;
  }
}

// -------------------- Lobby-Funktionen --------------------

/**
 * Erstellt eine neue Lobby in der Datenbank
 * @param {string} lobbyId - Die eindeutige ID der Lobby
 * @param {string} hostId - Die ID oder Email des Hosts
 * @param {string} hostName - Der Name des Hosts
 * @returns {Promise<boolean|object>} - true bei Erfolg, false bei Fehler
 */
export async function createLobby(lobbyId, hostId, hostName) {
  console.log("Creating lobby with:", { lobbyId, hostId, hostName });

  try {
    // Erstelle die Lobby
    const { data: lobbyData, error: lobbyError } = await supabase
      .from("Lobbys")
      .insert([
        {
          id: lobbyId,
          host_id: hostId.toString(), // Stelle sicher, dass es ein String ist
          host_name: hostName,
          created_at: new Date(),
          status: "waiting", // waiting, active, closed
        },
      ])
      .select();

    if (lobbyError) {
      console.error("Lobby konnte nicht erstellt werden:", lobbyError);
      return false;
    }

    console.log("Lobby created:", lobbyData);

    // Füge den Host als Teilnehmer hinzu
    const { data: playerData, error: playerError } = await supabase
      .from("LobbyPlayers")
      .insert([
        {
          lobby_id: lobbyId,
          user_id: hostId.toString(), // Stelle sicher, dass es ein String ist
          name: hostName,
          joined_at: new Date(),
          is_host: true,
        },
      ])
      .select();

    if (playerError) {
      console.error(
        "Host konnte nicht als Spieler hinzugefügt werden:",
        playerError
      );
      // Lobby wieder löschen
      await supabase.from("Lobbys").delete().eq("id", lobbyId);
      return false;
    }

    console.log("Player added:", playerData);

    return lobbyData[0];
  } catch (error) {
    console.error("Unerwarteter Fehler beim Erstellen der Lobby:", error);
    return false;
  }
}

/**
 * Spieler einer Lobby hinzufügen
 * @param {string} lobbyId - Die eindeutige ID der Lobby
 * @param {string} userId - Die ID oder Email des Spielers
 * @param {string} playerName - Der Name des Spielers
 * @returns {Promise<boolean|object>} - Die Spielerdaten bei Erfolg, false bei Fehler
 */
export async function joinLobby(lobbyId, userId, playerName) {
  // Prüfen, ob die Lobby existiert und offen ist
  const { data: lobbyData, error: lobbyError } = await supabase
    .from("Lobbys")
    .select("*")
    .eq("id", lobbyId)
    .eq("status", "waiting")
    .single();

  if (lobbyError || !lobbyData) {
    console.error("Lobby nicht gefunden oder bereits geschlossen:", lobbyError);
    return false;
  }

  // Prüfen, ob der Spieler bereits in der Lobby ist
  const { data: existingPlayer, error: existingPlayerError } = await supabase
    .from("LobbyPlayers")
    .select("*")
    .eq("lobby_id", lobbyId)
    .eq("user_id", userId)
    .single();

  if (existingPlayer) {
    // Spieler ist bereits in der Lobby
    return existingPlayer;
  }

  // Spieler der Lobby hinzufügen
  const { data: playerData, error: playerError } = await supabase
    .from("LobbyPlayers")
    .insert([
      {
        lobby_id: lobbyId,
        user_id: userId,
        name: playerName,
        joined_at: new Date(),
        is_host: false,
      },
    ])
    .select();

  if (playerError) {
    console.error("Spieler konnte nicht hinzugefügt werden:", playerError);
    return false;
  }

  return playerData[0];
}

/**
 * Alle Spieler einer Lobby abrufen
 * @param {string} lobbyId - Die eindeutige ID der Lobby
 * @returns {Promise<Array|boolean>} - Array mit Spielern bei Erfolg, false bei Fehler
 */
export async function getLobbyPlayers(lobbyId) {
  const { data: players, error } = await supabase
    .from("LobbyPlayers")
    .select("*")
    .eq("lobby_id", lobbyId)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("Fehler beim Abrufen der Spieler:", error);
    return false;
  }

  return players;
}

/**
 * Details einer Lobby abrufen
 * @param {string} lobbyId - Die eindeutige ID der Lobby
 * @returns {Promise<object|boolean>} - Lobby-Daten bei Erfolg, false bei Fehler
 */
export async function getLobbyDetails(lobbyId) {
  const { data: lobby, error } = await supabase
    .from("Lobbys")
    .select("*")
    .eq("id", lobbyId)
    .single();

  if (error) {
    console.error("Fehler beim Abrufen der Lobby:", error);
    return false;
  }

  return lobby;
}

/**
 * Status einer Lobby aktualisieren
 * @param {string} lobbyId - Die eindeutige ID der Lobby
 * @param {string} status - Der neue Status (waiting, active, closed)
 * @returns {Promise<boolean>} - true bei Erfolg, false bei Fehler
 */
export async function updateLobbyStatus(lobbyId, status) {
  const { error } = await supabase
    .from("Lobbys")
    .update({ status: status })
    .eq("id", lobbyId);

  if (error) {
    console.error("Fehler beim Aktualisieren des Lobby-Status:", error);
    return false;
  }

  return true;
}

/**
 * Testet die Verbindung zu Supabase und prüft, ob die benötigten Tabellen existieren
 * @returns {Promise<object>} - Ergebnis des Tests
 */
export async function testSupabaseConnection() {
  const result = {
    connection: false,
    tables: {
      Lobbys: false,
      LobbyPlayers: false,
    },
    errors: [],
  };

  try {
    // Test connection
    try {
      // Versuchen, eine nicht existierende Tabelle abzufragen, um die Verbindung zu testen
      const { data: testData, error: testError } = await supabase
        .from("_dummy_query_for_connection_test_")
        .select("*")
        .limit(1);

      // Wir erwarten hier einen Fehler, aber die Verbindung sollte funktionieren
      result.connection = true;
    } catch (connectionError) {
      // Wenn hier ein Fehler auftritt, liegt ein grundlegendes Verbindungsproblem vor
      result.errors.push({ connection: connectionError.message });
      return result;
    }

    // Wenn wir hier sind, ist die Verbindung ok
    result.connection = true;

    // Test for Lobbys table
    try {
      const { data: lobbyData, error: lobbyError } = await supabase
        .from("Lobbys")
        .select("id")
        .limit(1);

      if (lobbyError) {
        result.errors.push({ table: "Lobbys", message: lobbyError.message });
      } else {
        result.tables.Lobbys = true;
      }
    } catch (lobbyError) {
      result.errors.push({ table: "Lobbys", message: lobbyError.message });
    }

    // Test for LobbyPlayers table
    try {
      const { data: playerData, error: playerError } = await supabase
        .from("LobbyPlayers")
        .select("id")
        .limit(1);

      if (playerError) {
        result.errors.push({
          table: "LobbyPlayers",
          message: playerError.message,
        });
      } else {
        result.tables.LobbyPlayers = true;
      }
    } catch (playerError) {
      result.errors.push({
        table: "LobbyPlayers",
        message: playerError.message,
      });
    }

    return result;
  } catch (error) {
    result.errors.push({ general: error.message });
    return result;
  }
}
