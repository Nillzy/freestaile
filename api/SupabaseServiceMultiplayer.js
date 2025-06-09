import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
    process.env.SUPABASE_API_KEY
);

// Spielerliste einer Lobby abrufen
async function getLobbyPlayers(lobbyId) {
    try {
        console.log(`SupabaseService: Fetching players for lobby ${lobbyId}`);
        const { data, error } = await supabase
            .from("LobbyPlayers")
            .select("*")
            .eq("lobby_id", lobbyId);

        if (error) {
            console.error("Fehler beim Abrufen der Spieler:", error);
            throw error;
        }

        console.log(`SupabaseService: Found ${data ? data.length : 0} players`);
        return data || [];
    } catch (error) {
        console.error("Fehler beim Abrufen der Spieler:", error);
        return [];
    }
}

// Details einer Lobby abrufen
async function getLobbyDetails(lobbyId) {
    try {
        console.log(`SupabaseService: Fetching lobby details for ${lobbyId}`);
        const { data, error } = await supabase
            .from("Lobbys")
            .select("*")
            .eq("id", lobbyId)
            .single();

        if (error) {
            console.error("Fehler beim Abrufen der Lobby-Details:", error);
            throw error;
        }

        console.log("SupabaseService: Lobby details:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Abrufen der Lobby-Details:", error);
        return null;
    }
}

// Einer Lobby beitreten
async function joinLobby(lobbyId, userId, playerName) {
    try {
        console.log(`SupabaseService: User ${userId} joining lobby ${lobbyId}`);

        // Prüfe, ob die Lobby existiert
        const lobby = await getLobbyDetails(lobbyId);
        if (!lobby) {
            console.error("Lobby existiert nicht:", lobbyId);
            return null;
        }

        // Prüfe, ob der Spieler bereits in der Lobby ist
        const { data: existingPlayer, error: playerError } = await supabase
            .from("LobbyPlayers")
            .select("*")
            .eq("lobby_id", lobbyId)
            .eq("user_id", userId)
            .single();

        if (playerError && playerError.code !== "PGRST116") {
            // PGRST116 bedeutet "keine Ergebnisse"
            console.error(
                "Fehler beim Prüfen, ob der Spieler bereits in der Lobby ist:",
                playerError
            );
        }

        if (existingPlayer) {
            console.log("Spieler ist bereits in der Lobby:", existingPlayer);
            return existingPlayer;
        }

        // Spieler der Lobby hinzufügen
        const { data, error } = await supabase
            .from("LobbyPlayers")
            .insert([
                {
                    lobby_id: lobbyId,
                    user_id: userId,
                    name: playerName,
                    is_host: false, // Nur der Ersteller ist Host
                    joined_at: new Date().toISOString(),
                },
            ])
            .select()
            .single();

        if (error) {
            console.error("Fehler beim Beitreten der Lobby:", error);
            throw error;
        }

        console.log("Spieler erfolgreich der Lobby hinzugefügt:", data);
        return { success: true, player: data };
    } catch (error) {
        console.error("Fehler beim Beitreten der Lobby:", error);
        return { success: false, error: error.message };
    }
}

// Neue Lobby erstellen
async function createLobby(lobbyId, hostId, hostName) {
    try {
        console.log(
            `SupabaseService: Creating lobby ${lobbyId} with host ${hostId}`
        );

        const { data: lobbyData, error: lobbyError } = await supabase
            .from("Lobbys")
            .insert([
                {
                    id: lobbyId,
                    code: null,
                    host_id: hostId,
                    host_name: hostName,
                    status: "waiting",
                    current_slide: 1,
                    created_at: new Date().toISOString(),
                    started: false,
                },
            ])
            .select()
            .single();

        if (lobbyError) {
            console.error("Fehler beim Erstellen der Lobby:", lobbyError);
            throw lobbyError;
        }

        // Host als ersten Spieler hinzufügen
        const { data: playerData, error: playerError } = await supabase
            .from("LobbyPlayers")
            .insert([
                {
                    lobby_id: lobbyId,
                    user_id: hostId,
                    name: hostName,
                    is_host: true,
                    joined_at: new Date().toISOString(),
                    score: 0,
                    is_ready: true,
                },
            ])
            .select()
            .single();

        if (playerError) {
            console.error(
                "Fehler beim Hinzufügen des Hosts als Spieler:",
                playerError
            );
            throw playerError;
        }

        console.log("Host erfolgreich als Spieler hinzugefügt:", playerData);
        return lobbyData;
    } catch (error) {
        console.error("Fehler beim Erstellen der Lobby:", error);
        return null;
    }
}

// ===== NEUE MULTIPLAYER-FUNKTIONEN =====

// Lobby-Status aktualisieren (erweitert)
async function updateLobbyStatus(lobbyId, status, additionalData = {}) {
    try {
        console.log(
            `SupabaseService: Updating lobby ${lobbyId} status to ${status}`
        );

        const updateData = {
            status,
            ...additionalData,
        };

        const { data, error } = await supabase
            .from("Lobbys")
            .update(updateData)
            .eq("id", lobbyId)
            .select()
            .single();

        if (error) {
            console.error("Fehler beim Aktualisieren des Lobby-Status:", error);
            throw error;
        }

        // Game Event erstellen
        await createGameEvent(lobbyId, "status_change", {
            new_status: status,
            ...additionalData,
        });

        console.log("Lobby-Status erfolgreich aktualisiert:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Aktualisieren des Lobby-Status:", error);
        return null;
    }
}

// Spiel starten
async function startGame(lobbyId, hostId) {
    try {
        console.log(`SupabaseService: Starting game for lobby ${lobbyId}`);

        // Prüfe, ob der User der Host ist
        const lobby = await getLobbyDetails(lobbyId);
        if (!lobby || lobby.host_id !== hostId) {
            throw new Error("Nur der Host kann das Spiel starten");
        }

        const result = await updateLobbyStatus(lobbyId, "playing", {
            current_slide: 1,
            started_at: new Date().toISOString(),
        });

        // Game Event erstellen
        await createGameEvent(lobbyId, "game_start", { started_by: hostId });

        return result;
    } catch (error) {
        console.error("Fehler beim Starten des Spiels:", error);
        return null;
    }
}

// Nächste Folie
async function nextSlide(lobbyId, hostId) {
    try {
        console.log(`SupabaseService: Moving to next slide for lobby ${lobbyId}`);

        const lobby = await getLobbyDetails(lobbyId);
        if (!lobby || lobby.host_id !== hostId) {
            throw new Error("Nur der Host kann Folien wechseln");
        }

        const nextSlideNumber = (lobby.current_slide || 1) + 1;

        const result = await updateLobbyStatus(lobbyId, lobby.status, {
            current_slide: nextSlideNumber,
        });

        // Game Event erstellen
        await createGameEvent(lobbyId, "slide_change", {
            slide_number: nextSlideNumber,
            changed_by: hostId,
        });

        return result;
    } catch (error) {
        console.error("Fehler beim Wechseln zur nächsten Folie:", error);
        return null;
    }
}

// Vorherige Folie
async function previousSlide(lobbyId, hostId) {
    try {
        console.log(
            `SupabaseService: Moving to previous slide for lobby ${lobbyId}`
        );

        const lobby = await getLobbyDetails(lobbyId);
        if (!lobby || lobby.host_id !== hostId) {
            throw new Error("Nur der Host kann Folien wechseln");
        }

        const prevSlideNumber = Math.max((lobby.current_slide || 1) - 1, 1);

        const result = await updateLobbyStatus(lobbyId, lobby.status, {
            current_slide: prevSlideNumber,
        });

        // Game Event erstellen
        await createGameEvent(lobbyId, "slide_change", {
            slide_number: prevSlideNumber,
            changed_by: hostId,
        });

        return result;
    } catch (error) {
        console.error("Fehler beim Wechseln zur vorherigen Folie:", error);
        return null;
    }
}

// ===== CHAT-FUNKTIONEN =====

// Chat-Nachricht senden
async function sendChatMessage(
    lobbyId,
    playerId,
    message,
    messageType = "chat"
) {
    try {
        console.log(`SupabaseService: Sending chat message to lobby ${lobbyId}`);

        const { data, error } = await supabase
            .from("chat_messages")
            .insert([
                {
                    lobby_id: lobbyId,
                    name: playerId,
                    message: message,
                    message_type: messageType,
                },
            ])
            .select()
            .single();

        if (error) {
            console.error("Fehler beim Senden der Chat-Nachricht:", error);
            throw error;
        }

        console.log("Chat-Nachricht erfolgreich gesendet:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Senden der Chat-Nachricht:", error);
        return null;
    }
}

// Chat-Nachrichten abrufen
async function getChatMessages(lobbyId, limit = 50) {
    try {
        console.log(`SupabaseService: Fetching chat messages for lobby ${lobbyId}`);

        const { data, error } = await supabase
            .from("chat_messages")
            .select(
                `
        *,
        player:LobbyPlayers(name, is_host)
      `
            )
            .eq("lobby_id", lobbyId)
            .order("sent_at", { ascending: true })
            .limit(limit);

        if (error) {
            console.error("Fehler beim Abrufen der Chat-Nachrichten:", error);
            throw error;
        }

        console.log(
            `SupabaseService: Found ${data ? data.length : 0} chat messages`
        );
        return data || [];
    } catch (error) {
        console.error("Fehler beim Abrufen der Chat-Nachrichten:", error);
        return [];
    }
}

// ===== FOLIEN-FUNKTIONEN =====

// Folien für Lobby speichern
async function saveLobbySlides(lobbyId, slides) {
    try {
        console.log(
            `SupabaseService: Saving ${slides.length} slides for lobby ${lobbyId}`
        );

        // Alte Folien löschen
        await supabase.from("lobby_slides").delete().eq("lobby_id", lobbyId);

        // Neue Folien einfügen
        const slidesData = slides.map((slide, index) => ({
            lobby_id: lobbyId,
            slide_number: index + 1,
            content: slide.content,
            slide_type: slide.type || "presentation",
            options: slide.options || null,
        }));

        const { data, error } = await supabase
            .from("lobby_slides")
            .insert(slidesData)
            .select();

        if (error) {
            console.error("Fehler beim Speichern der Folien:", error);
            throw error;
        }

        console.log("Folien erfolgreich gespeichert:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Speichern der Folien:", error);
        return null;
    }
}

// Folien für Lobby abrufen
async function getLobbySlides(lobbyId) {
    try {
        console.log(`SupabaseService: Fetching slides for lobby ${lobbyId}`);

        const { data, error } = await supabase
            .from("lobby_slides")
            .select("*")
            .eq("lobby_id", lobbyId)
            .order("slide_number", { ascending: true });

        if (error) {
            console.error("Fehler beim Abrufen der Folien:", error);
            throw error;
        }

        console.log(`SupabaseService: Found ${data ? data.length : 0} slides`);
        return data || [];
    } catch (error) {
        console.error("Fehler beim Abrufen der Folien:", error);
        return [];
    }
}

// Aktuelle Folie abrufen
async function getCurrentSlide(lobbyId) {
    try {
        const lobby = await getLobbyDetails(lobbyId);
        if (!lobby) return null;

        const { data, error } = await supabase
            .from("lobby_slides")
            .select("*")
            .eq("lobby_id", lobbyId)
            .eq("slide_number", lobby.current_slide || 1)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Fehler beim Abrufen der aktuellen Folie:", error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error("Fehler beim Abrufen der aktuellen Folie:", error);
        return null;
    }
}

// ===== GAME EVENTS =====

// Game Event erstellen
async function createGameEvent(lobbyId, eventType, eventData = {}) {
    try {
        const { data, error } = await supabase
            .from("game_events")
            .insert([
                {
                    lobby_id: lobbyId,
                    event_type: eventType,
                    event_data: eventData,
                },
            ])
            .select()
            .single();

        if (error) {
            console.error("Fehler beim Erstellen des Game Events:", error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error("Fehler beim Erstellen des Game Events:", error);
        return null;
    }
}

// ===== SPIELER-FUNKTIONEN =====

// Spieler-Score aktualisieren
async function updatePlayerScore(playerId, score) {
    try {
        console.log(
            `SupabaseService: Updating score for player ${playerId} to ${score}`
        );

        const { data, error } = await supabase
            .from("LobbyPlayers")
            .update({ score: score })
            .eq("name", playerId)
            .select()
            .single();

        if (error) {
            console.error("Fehler beim Aktualisieren des Spieler-Scores:", error);
            throw error;
        }

        console.log("Spieler-Score erfolgreich aktualisiert:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Aktualisieren des Spieler-Scores:", error);
        return null;
    }
}

// Spieler-Antwort speichern
async function savePlayerAnswer(
    lobbyId,
    playerId,
    slideId,
    answer,
    points = 0
) {
    try {
        console.log(`SupabaseService: Saving answer for player ${playerId}`);

        const { data, error } = await supabase
            .from("player_answers")
            .insert([
                {
                    lobby_id: lobbyId,
                    name: playerId,
                    slide_id: slideId,
                    answer: answer,
                    points: points,
                },
            ])
            .select()
            .single();

        if (error) {
            console.error("Fehler beim Speichern der Spieler-Antwort:", error);
            throw error;
        }

        // Score aktualisieren
        const player = await supabase
            .from("LobbyPlayers")
            .select("score")
            .eq("name", playerId)
            .single();

        if (player.data) {
            await updatePlayerScore(playerId, (player.data.score || 0) + points);
        }

        console.log("Spieler-Antwort erfolgreich gespeichert:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Speichern der Spieler-Antwort:", error);
        return null;
    }
}

// Scoreboard abrufen
async function getScoreboard(lobbyId) {
    try {
        console.log(`SupabaseService: Fetching scoreboard for lobby ${lobbyId}`);

        const { data, error } = await supabase
            .from("LobbyPlayers")
            .select("name, score, is_host")
            .eq("lobby_id", lobbyId)
            .order("score", { ascending: false });

        if (error) {
            console.error("Fehler beim Abrufen des Scoreboards:", error);
            throw error;
        }

        console.log(
            `SupabaseService: Found ${data ? data.length : 0} players in scoreboard`
        );
        return data || [];
    } catch (error) {
        console.error("Fehler beim Abrufen des Scoreboards:", error);
        return [];
    }
}

// ===== HILFSFUNKTIONEN =====

// Vollständige Lobby-Daten abrufen (mit Chat, Folien, etc.)
async function getFullLobbyData(lobbyId) {
    try {
        console.log(`SupabaseService: Fetching full lobby data for ${lobbyId}`);

        const [lobby, players, chat, slides] = await Promise.all([
            getLobbyDetails(lobbyId),
            getLobbyPlayers(lobbyId),
            getChatMessages(lobbyId),
            getLobbySlides(lobbyId),
        ]);

        return {
            lobby,
            players: players || [],
            chat: chat || [],
            slides: slides || [],
            currentSlide: await getCurrentSlide(lobbyId),
        };
    } catch (error) {
        console.error("Fehler beim Abrufen der vollständigen Lobby-Daten:", error);
        return null;
    }
}

// 6-stelligen Join-Code generieren
function generateJoinCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Lobby mit Join-Code erstellen
async function createLobbyWithCode(hostId, hostName) {
    try {
        let code;
        let attempts = 0;
        const maxAttempts = 10;

        // Versuche einen eindeutigen Code zu generieren
        do {
            code = generateJoinCode();
            attempts++;

            const { data: existingLobby } = await supabase
                .from("Lobbys")
                .select("id")
                .eq("code", code)
                .single();

            if (!existingLobby) break;
        } while (attempts < maxAttempts);

        if (attempts >= maxAttempts) {
            throw new Error("Konnte keinen eindeutigen Join-Code generieren");
        }

        // Lobby mit Code erstellen
        const lobbyId = crypto.randomUUID();

        const { data: lobbyData, error: lobbyError } = await supabase
            .from("Lobbys")
            .insert([
                {
                    id: lobbyId,
                    code: code,
                    host_id: hostId,
                    host_name: hostName,
                    status: "waiting",
                    current_slide: 1,
                    game_mode: "presentation",
                    max_players: 10,
                    created_at: new Date().toISOString(),
                },
            ])
            .select()
            .single();

        if (lobbyError) {
            console.error("Fehler beim Erstellen der Lobby:", lobbyError);
            throw lobbyError;
        }

        // Host als ersten Spieler hinzufügen
        const { data: playerData, error: playerError } = await supabase
            .from("LobbyPlayers")
            .insert([
                {
                    lobby_id: lobbyId,
                    user_id: hostId,
                    name: hostName,
                    is_host: true,
                    joined_at: new Date().toISOString(),
                    score: 0,
                    is_ready: true,
                },
            ])
            .select()
            .single();

        if (playerError) {
            console.error("Fehler beim Hinzufügen des Hosts:", playerError);
            throw playerError;
        }

        // System-Nachricht senden
        await sendChatMessage(
            lobbyId,
            playerData.name,
            `${hostName} hat die Lobby erstellt!`,
            "system"
        );

        console.log("Lobby mit Code erfolgreich erstellt:", {
            lobby: lobbyData,
            code,
        });
        return { lobby: lobbyData, player: playerData, code };
    } catch (error) {
        console.error("Fehler beim Erstellen der Lobby mit Code:", error);
        return null;
    }
}

// Lobby über Join-Code beitreten
async function joinLobbyByCode(code, userId, playerName) {
    try {
        console.log(
            `SupabaseService: User ${userId} joining lobby with code ${code}`
        );

        // Lobby über Code finden
        const { data: lobby, error: lobbyError } = await supabase
            .from("Lobbys")
            .select("*")
            .eq("code", code)
            .single();

        if (lobbyError || !lobby) {
            console.error("Lobby mit Code nicht gefunden:", code);
            return null;
        }

        // Prüfe, ob die Lobby noch Platz hat
        const players = await getLobbyPlayers(lobby.id);
        if (players && players.length >= lobby.max_players) {
            throw new Error("Lobby ist voll");
        }

        // Prüfe, ob das Spiel bereits läuft
        if (lobby.status === "playing" || lobby.status === "finished") {
            throw new Error("Spiel läuft bereits oder ist beendet");
        }

        // Spieler hinzufügen
        const result = await joinLobby(lobby.id, userId, playerName);

        if (result) {
            // System-Nachricht senden
            await sendChatMessage(
                lobby.id,
                result.name,
                `${playerName} ist der Lobby beigetreten!`,
                "system"
            );

            // Game Event erstellen
            await createGameEvent(lobby.id, "player_join", {
                player_name: playerName,
            });
        }

        return { lobby, player: result };
    } catch (error) {
        console.error("Fehler beim Beitreten der Lobby über Code:", error);
        return null;
    }
}

// Supabase-Verbindung testen
async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase
            .from("Lobbys")
            .select("count", { count: "exact", head: true });

        if (error) {
            console.error("Supabase-Verbindungstest fehlgeschlagen:", error);
            return false;
        }

        console.log("Supabase-Verbindung erfolgreich");
        return true;
    } catch (error) {
        console.error("Supabase-Verbindungstest fehlgeschlagen:", error);
        return false;
    }
}

export {
    getLobbyPlayers,
    getLobbyDetails,
    joinLobby,
    createLobby,
    updateLobbyStatus,
    testSupabaseConnection,
    startGame,
    nextSlide,
    previousSlide,
    sendChatMessage,
    getChatMessages,
    saveLobbySlides,
    getLobbySlides,
    getCurrentSlide,
    createGameEvent,
    updatePlayerScore,
    savePlayerAnswer,
    getScoreboard,
    getFullLobbyData,
    generateJoinCode,
    createLobbyWithCode,
    joinLobbyByCode,
};