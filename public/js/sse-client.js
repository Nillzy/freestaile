/**
 * SSE-Client als Ersatz für Socket.IO auf Vercel
 * Verwendet Server-Sent Events für Real-time Updates
 */
class SSEClient {
  constructor() {
    this.eventSource = null;
    this.lobbyId = null;
    this.userId = null;
    this.userName = null;
    this.isHost = false;
    this.connected = false;
    this.eventHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  // Event-Handler registrieren (ähnlich wie socket.on)
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
  connect(lobbyId, userId, userName, isHost = false) {
    this.lobbyId = lobbyId;
    this.userId = userId;
    this.userName = userName;
    this.isHost = isHost;

    this.disconnect(); // Bestehende Verbindung schließen

    try {
      // Server-Sent Events Verbindung
      this.eventSource = new EventSource(`/api/lobby/${lobbyId}/events`);

      this.eventSource.onopen = () => {
        console.log("SSE-Verbindung hergestellt");
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit("connect");
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (error) {
          console.error("Fehler beim Parsen der SSE-Nachricht:", error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error("SSE-Fehler:", error);
        this.connected = false;
        this.emit("connect_error", error);

        // Automatische Wiederverbindung
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++;
            console.log(
              `Wiederverbindungsversuch ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
            );
            this.connect(this.lobbyId, this.userId, this.userName, this.isHost);
          }, this.reconnectDelay * this.reconnectAttempts);
        }
      };
    } catch (error) {
      console.error("Fehler beim Erstellen der SSE-Verbindung:", error);
      this.emit("connect_error", error);
    }
  }

  // Server-Nachrichten verarbeiten
  handleServerMessage(data) {
    switch (data.type) {
      case "connected":
        console.log("SSE-Verbindung bestätigt");
        break;
      case "heartbeat":
        // Heartbeat ignorieren
        break;
      case "playerJoined":
        this.emit("playerJoined", data.player);
        this.emit("lobbyUpdate", { players: data.players });
        break;
      case "chatMessage":
        this.emit("chatMessage", data);
        break;
      case "slideChanged":
        this.emit("slideChanged", { slideIndex: data.slideIndex });
        break;
      case "presentationStarted":
        this.emit("presentationStarted", data);
        break;
      default:
        console.log("Unbekannte SSE-Nachricht:", data);
    }
  }

  // Aktion an Server senden (ersetzt socket.emit)
  async sendAction(action, data, callback) {
    try {
      const response = await fetch(`/api/lobby/${this.lobbyId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: action,
          data: data,
        }),
      });

      const result = await response.json();

      if (callback) {
        callback(result);
      }

      return result;
    } catch (error) {
      console.error(`Fehler beim Senden der Aktion ${action}:`, error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
      return { success: false, error: error.message };
    }
  }

  // Lobby beitreten
  async joinLobby(callback) {
    return this.sendAction(
      "joinLobby",
      {
        userId: this.userId,
        userName: this.userName,
      },
      callback
    );
  }

  // Chat-Nachricht senden
  async sendChatMessage(message) {
    return this.sendAction("chatMessage", {
      message: message,
      playerId: this.userId,
      playerName: this.userName,
      isHost: this.isHost,
    });
  }

  // Slide ändern (nur Host)
  async changeSlide(slideIndex) {
    if (!this.isHost) {
      console.warn("Nur der Host kann Slides ändern");
      return;
    }
    return this.sendAction("slideChange", { slideIndex });
  }

  // Präsentation starten (nur Host)
  async startPresentation() {
    if (!this.isHost) {
      console.warn("Nur der Host kann die Präsentation starten");
      return;
    }
    return this.sendAction("startPresentation", {});
  }

  // Verbindung trennen
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    this.emit("disconnect");
  }

  // Verbindungsstatus prüfen
  isConnected() {
    return (
      this.connected &&
      this.eventSource &&
      this.eventSource.readyState === EventSource.OPEN
    );
  }
}

// Globale Instanz für Kompatibilität mit bestehendem Code
window.SSEClient = SSEClient;

console.log("SSE-Client geladen - Vercel-kompatibel ohne Socket.IO");
