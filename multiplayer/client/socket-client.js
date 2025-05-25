/**
 * Socket.io-Client für die Multiplayer-Funktionalität
 */
class MultiplayerClient {
  constructor() {
    this.socket = null;
    this.lobbyId = null;
    this.isHost = false;
    this.players = [];
    this.eventHandlers = {};
  }

  /**
   * Verbindung zum Socket.io-Server herstellen
   * @returns {Promise} Promise, das resolved, wenn die Verbindung hergestellt wurde
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        // Socket.io-Client laden
        if (typeof io === "undefined") {
          const script = document.createElement("script");
          script.src = "https://cdn.socket.io/4.6.0/socket.io.min.js";
          script.async = true;
          script.onload = () => this._initializeSocket(resolve);
          script.onerror = (err) =>
            reject(new Error("Fehler beim Laden von Socket.io"));
          document.head.appendChild(script);
        } else {
          this._initializeSocket(resolve);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Socket.io-Client initialisieren
   * @param {Function} resolve - Promise resolve-Funktion
   * @private
   */
  _initializeSocket(resolve) {
    this.socket = io("/lobby");

    // Verbindung hergestellt
    this.socket.on("connect", () => {
      console.log("Verbunden mit Socket.io-Server");
      resolve();
    });

    // Verbindungsfehler behandeln
    this.socket.on("connect_error", (err) => {
      console.error("Verbindungsfehler:", err);
      this._triggerEvent("error", { message: "Verbindungsfehler", error: err });
    });

    // Event-Handler für Lobby-Events
    this.socket.on("playerJoined", (playerInfo) => {
      this.players.push(playerInfo);
      this._triggerEvent("playerJoined", playerInfo);
    });

    this.socket.on("playerLeft", (playerInfo) => {
      this.players = this.players.filter((p) => p.id !== playerInfo.id);
      this._triggerEvent("playerLeft", playerInfo);
    });

    this.socket.on("presentationStarted", () => {
      this._triggerEvent("presentationStarted");
    });

    this.socket.on("newChatMessage", (message) => {
      this._triggerEvent("newChatMessage", message);
    });

    this.socket.on("lobbyEnded", (reason) => {
      this._triggerEvent("lobbyEnded", reason);
    });
  }

  /**
   * Lobby als Host erstellen
   * @returns {Promise} Promise mit Lobby-Informationen
   */
  createLobby() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error("Keine Verbindung zum Server"));
      }

      this.socket.emit("createLobby", (response) => {
        if (response.success) {
          this.lobbyId = response.lobbyId;
          this.isHost = true;
          resolve(response);
        } else {
          reject(
            new Error(response.error || "Fehler beim Erstellen der Lobby")
          );
        }
      });
    });
  }

  /**
   * Lobby als Client beitreten
   * @param {string} lobbyId - Lobby-ID
   * @param {string} userName - Benutzername
   * @returns {Promise} Promise mit Lobby-Informationen
   */
  joinLobby(lobbyId, userName) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error("Keine Verbindung zum Server"));
      }

      this.socket.emit("joinLobby", { lobbyId, userName }, (response) => {
        if (response.success) {
          this.lobbyId = lobbyId;
          this.isHost = false;
          this.players = response.lobby.players;
          resolve(response.lobby);
        } else {
          reject(
            new Error(response.error || "Fehler beim Beitreten der Lobby")
          );
        }
      });
    });
  }

  /**
   * Präsentation starten (nur Host)
   */
  startPresentation() {
    if (!this.socket || !this.isHost) {
      console.error("Nur der Host kann die Präsentation starten");
      return;
    }

    this.socket.emit("startPresentation");
  }

  /**
   * Chat-Nachricht senden
   * @param {string} message - Nachrichtentext
   */
  sendChatMessage(message) {
    if (!this.socket || !this.lobbyId) {
      console.error("Nicht mit einer Lobby verbunden");
      return;
    }

    this.socket.emit("chatMessage", message);
  }

  /**
   * Event-Handler registrieren
   * @param {string} event - Event-Name
   * @param {Function} callback - Callback-Funktion
   */
  on(event, callback) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }

    this.eventHandlers[event].push(callback);
  }

  /**
   * Event auslösen
   * @param {string} event - Event-Name
   * @param {*} data - Event-Daten
   * @private
   */
  _triggerEvent(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach((callback) => callback(data));
    }
  }

  /**
   * Verbindung trennen
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.lobbyId = null;
      this.isHost = false;
      this.players = [];
    }
  }
}

// Globale Instanz exportieren
window.multiplayerClient = new MultiplayerClient();
