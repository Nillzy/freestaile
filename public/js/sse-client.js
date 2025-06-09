/**
 * Supabase Realtime Client als Ersatz für Socket.IO
 * Optimiert für Vercel-Deployment und serverless Architektur
 */

class SupabaseRealtimeClient {
  constructor() {
    this.supabase = null;
    this.channel = null;
    this.lobbyId = null;
    this.userId = null;
    this.userName = null;
    this.isHost = false;
    this.connected = false;
    this.eventHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  // Supabase Client initialisieren
  async initializeSupabase() {
    if (this.supabase) return this.supabase;

    try {
      // Supabase-Konfiguration vom Server abrufen
      const configResponse = await fetch("/api/supabase-config");
      const config = await configResponse.json();

      // Supabase Client erstellen
      const { createClient } = window.supabase;
      this.supabase = createClient(config.url, config.anonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });

      console.log("Supabase Realtime Client initialisiert");
      return this.supabase;
    } catch (error) {
      console.error("Fehler beim Initialisieren von Supabase:", error);
      throw error;
    }
  }

  // Event-Handler hinzufügen
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  // Event-Handler entfernen
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Event auslösen
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(
            `Fehler beim Ausführen des Event-Handlers für ${event}:`,
            error
          );
        }
      });
    }
  }

  // Verbindung zur Lobby herstellen
  async connect(lobbyId, userId, userName, isHost = false) {
    this.lobbyId = lobbyId;
    this.userId = userId;
    this.userName = userName;
    this.isHost = isHost;

    try {
      // Supabase initialisieren
      await this.initializeSupabase();

      // Bestehende Verbindung trennen
      this.disconnect();

      // Realtime Channel für die Lobby erstellen
      this.channel = this.supabase.channel(`lobby:${lobbyId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: userId },
        },
      });

      // Event-Listener für verschiedene Realtime-Events
      this.channel
        .on("broadcast", { event: "player_joined" }, (payload) => {
          console.log("Player joined:", payload);
          this.emit("playerJoined", payload.payload);
        })
        .on("broadcast", { event: "player_left" }, (payload) => {
          console.log("Player left:", payload);
          this.emit("playerLeft", payload.payload);
        })
        .on("broadcast", { event: "chat_message" }, (payload) => {
          console.log("Chat message:", payload);
          this.emit("chatMessage", payload.payload);
        })
        .on("broadcast", { event: "slide_changed" }, (payload) => {
          console.log("Slide changed:", payload);
          this.emit("slideChanged", payload.payload);
        })
        .on("broadcast", { event: "presentation_started" }, (payload) => {
          console.log("Presentation started:", payload);
          this.emit("presentationStarted", payload.payload);
        })
        .on("broadcast", { event: "lobby_update" }, (payload) => {
          console.log("Lobby update:", payload);
          this.emit("lobbyUpdate", payload.payload);
        })
        .on("presence", { event: "sync" }, () => {
          const state = this.channel.presenceState();
          console.log("Presence sync:", state);
          this.emit("presenceUpdate", state);
        })
        .on("presence", { event: "join" }, ({ key, newPresences }) => {
          console.log("User joined presence:", key, newPresences);
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
          console.log("User left presence:", key, leftPresences);
        });

      // Channel abonnieren
      const status = await this.channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          console.log("Supabase Realtime verbunden für Lobby:", lobbyId);
          this.connected = true;
          this.reconnectAttempts = 0;

          // Presence-Status setzen
          await this.channel.track({
            user_id: userId,
            user_name: userName,
            is_host: isHost,
            online_at: new Date().toISOString(),
          });

          this.emit("connect");
        } else if (status === "CHANNEL_ERROR") {
          console.error("Supabase Realtime Fehler");
          this.connected = false;
          this.emit("connect_error", new Error("Channel Error"));
          this.handleReconnect();
        } else if (status === "TIMED_OUT") {
          console.error("Supabase Realtime Timeout");
          this.connected = false;
          this.emit("connect_error", new Error("Timeout"));
          this.handleReconnect();
        }
      });

      console.log("Channel subscription status:", status);
    } catch (error) {
      console.error("Fehler beim Verbinden mit Supabase Realtime:", error);
      this.emit("connect_error", error);
      this.handleReconnect();
    }
  }

  // Automatische Wiederverbindung
  async handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        console.log(
          `Wiederverbindungsversuch ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
        );
        this.connect(this.lobbyId, this.userId, this.userName, this.isHost);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("Maximale Anzahl von Wiederverbindungsversuchen erreicht");
      this.emit("connect_error", new Error("Max reconnect attempts reached"));
    }
  }

  // Broadcast-Nachricht senden
  async broadcast(event, data) {
    if (!this.channel || !this.connected) {
      console.warn("Nicht mit Realtime verbunden");
      return false;
    }

    try {
      await this.channel.send({
        type: "broadcast",
        event: event,
        payload: data,
      });
      return true;
    } catch (error) {
      console.error(`Fehler beim Senden von ${event}:`, error);
      return false;
    }
  }

  // Lobby beitreten
  async joinLobby(callback) {
    try {
      const response = await fetch(`/api/lobby/${this.lobbyId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "joinLobby",
          data: {
            userId: this.userId,
            userName: this.userName,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Broadcast an alle anderen Teilnehmer
        await this.broadcast("player_joined", {
          user_id: this.userId,
          name: this.userName,
          is_host: this.isHost,
        });
      }

      if (callback) callback(result);
      return result;
    } catch (error) {
      console.error("Fehler beim Beitreten der Lobby:", error);
      const errorResult = { success: false, error: error.message };
      if (callback) callback(errorResult);
      return errorResult;
    }
  }

  // Chat-Nachricht senden
  async sendChatMessage(message) {
    try {
      const chatData = {
        userId: this.userId,
        userName: this.userName,
        message: message.trim(),
        isHost: this.isHost,
        timestamp: new Date().toISOString(),
      };

      // Broadcast an alle Teilnehmer
      await this.broadcast("chat_message", chatData);

      // Optional: Auch in der Datenbank speichern
      await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lobbyId: this.lobbyId,
          ...chatData,
        }),
      });

      return { success: true };
    } catch (error) {
      console.error("Fehler beim Senden der Chat-Nachricht:", error);
      return { success: false, error: error.message };
    }
  }

  // Slide ändern (nur Host)
  async changeSlide(slideIndex) {
    if (!this.isHost) {
      console.warn("Nur der Host kann Slides ändern");
      return { success: false, error: "Nur der Host kann Slides ändern" };
    }

    try {
      await this.broadcast("slide_changed", {
        slideIndex: slideIndex,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      console.error("Fehler beim Ändern der Slide:", error);
      return { success: false, error: error.message };
    }
  }

  // Präsentation starten (nur Host)
  async startPresentation() {
    if (!this.isHost) {
      console.warn("Nur der Host kann die Präsentation starten");
      return {
        success: false,
        error: "Nur der Host kann die Präsentation starten",
      };
    }

    try {
      await this.broadcast("presentation_started", {
        lobbyId: this.lobbyId,
        message: "Die Präsentation wurde gestartet!",
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      console.error("Fehler beim Starten der Präsentation:", error);
      return { success: false, error: error.message };
    }
  }

  // Lobby-Update senden
  async sendLobbyUpdate(data) {
    try {
      await this.broadcast("lobby_update", {
        lobbyId: this.lobbyId,
        ...data,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      console.error("Fehler beim Senden des Lobby-Updates:", error);
      return { success: false, error: error.message };
    }
  }

  // Verbindung trennen
  disconnect() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.connected = false;
    this.emit("disconnect");
  }

  // Verbindungsstatus prüfen
  isConnected() {
    return this.connected && this.channel;
  }

  // Presence-Status abrufen
  getPresence() {
    if (!this.channel) return {};
    return this.channel.presenceState();
  }
}

// Globale Instanz für Kompatibilität mit bestehendem Code
window.SupabaseRealtimeClient = SupabaseRealtimeClient;

console.log(
  "Supabase Realtime Client geladen - Vercel-kompatibel ohne Socket.IO"
);
