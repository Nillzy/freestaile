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
    this.userId = null;
    this.userName = null;
    this.hostId = null;
  }

  /**
   * Setzt die Benutzerdaten für den Client.
   * Muss aufgerufen werden, bevor connect() oder andere Aktionen ausgeführt werden.
   * @param {string} userId - Die persistente ID des Benutzers.
   * @param {string} userName - Der Anzeigename des Benutzers.
   */
  setUser(userId, userName) {
    this.userId = userId;
    this.userName = userName;
    console.log(`Benutzer gesetzt: userId=${userId}, userName=${userName}`);
  }

  /**
   * Verbindung zum Socket.io-Server herstellen
   * @returns {Promise} Promise, das resolved, wenn die Verbindung hergestellt wurde
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (!this.userId || !this.userName) {
        return reject(
          new Error(
            "Benutzerdaten (userId, userName) müssen zuerst mit setUser() gesetzt werden."
          )
        );
      }
      try {
        // Socket.io-Client laden
        if (typeof io === "undefined") {
          const script = document.createElement("script");
          script.src = "https://cdn.socket.io/4.6.0/socket.io.min.js";
          script.async = true;
          script.onload = () => this._initializeSocket(resolve, reject);
          script.onerror = (err) =>
            reject(new Error("Fehler beim Laden von Socket.io"));
          document.head.appendChild(script);
        } else {
          this._initializeSocket(resolve, reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Socket.io-Client initialisieren
   * @param {Function} resolve - Promise resolve-Funktion
   * @param {Function} reject - Promise reject-Funktion
   * @private
   */
  _initializeSocket(resolve, reject) {
    // Übergebe userId und userName im Auth-Handshake
    this.socket = io("/lobby", {
      auth: {
        userId: this.userId,
        userName: this.userName,
      },
    });

    this.socket.on("connect", () => {
      console.log(
        "Verbunden mit Socket.io-Server. Eigene Socket-ID:",
        this.socket.id
      );
      // Wichtig: Die client-seitige this.hostId wird jetzt durch Server-Events/Callbacks gesetzt.
      resolve();
    });

    this.socket.on("connect_error", (err) => {
      console.error("Verbindungsfehler:", err);
      this._triggerEvent("error", { message: "Verbindungsfehler", error: err });
      reject(err); // Auch den Promise rejecten
    });

    this.socket.on("playerJoined", (playerInfo) => {
      console.log("Socket Event: playerJoined", playerInfo);
      const existingPlayerIndex = this.players.findIndex(
        (p) => p.id === playerInfo.id
      );
      if (existingPlayerIndex !== -1) {
        this.players[existingPlayerIndex] = {
          ...this.players[existingPlayerIndex],
          ...playerInfo,
        };
      } else {
        this.players.push(playerInfo);
      }
      // Wenn der beigetretene Spieler der Host ist und dessen ID noch nicht gesetzt war, setze sie.
      if (playerInfo.isHost && !this.hostId) {
        this.hostId = playerInfo.id;
      }
      this._triggerEvent("playerJoined", playerInfo);
    });

    this.socket.on("playerLeft", (playerInfo) => {
      console.log("Socket Event: playerLeft", playerInfo);
      this.players = this.players.filter(
        (p) => !(p.id === playerInfo.id && p.socketId === playerInfo.socketId)
      );
      this._triggerEvent("playerLeft", playerInfo);
    });

    this.socket.on("hostDisconnected", (data) => {
      console.log("Socket Event: hostDisconnected", data);
      // Hier könnte man UI-Logik hinzufügen, z.B. eine Meldung anzeigen.
      // Der Host bleibt in der Spielerliste, aber man könnte seinen Status ändern.
      this._triggerEvent("hostDisconnected", data);
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
      if (!this.socket) return reject(new Error("Keine Verbindung zum Server"));
      if (!this.userId || !this.userName)
        return reject(new Error("Benutzerdaten nicht gesetzt"));

      // Sende userId und userName mit, damit der Server weiß, wer der Host ist
      this.socket.emit(
        "createLobby",
        { userId: this.userId, userName: this.userName },
        (response) => {
          if (response.success) {
            this.lobbyId = response.lobbyId;
            this.isHost = true;
            this.hostId = response.hostId; // Host-ID vom Server (sollte this.userId sein)
            this.players = response.initialPlayers || []; // Spielerliste vom Server übernehmen
            console.log(
              "Lobby erstellt Client: lobbyId=",
              this.lobbyId,
              "hostId=",
              this.hostId,
              "players=",
              this.players
            );
            resolve(response);
          } else {
            reject(
              new Error(response.error || "Fehler beim Erstellen der Lobby")
            );
          }
        }
      );
    });
  }

  /**
   * Lobby als Client beitreten
   * @param {string} lobbyId - Lobby-ID
   * @param {string} userNameForLobby - Der Name, den der User in DIESER Lobby haben will
   * @returns {Promise} Promise mit Lobby-Informationen
   */
  joinLobby(lobbyId, userNameForLobby) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Keine Verbindung zum Server"));
      if (!this.userId) return reject(new Error("UserId nicht gesetzt"));
      const nameToSend = userNameForLobby || this.userName; // Fallback auf den globalen Usernamen

      this.socket.emit(
        "joinLobby",
        { lobbyId, userName: nameToSend, userId: this.userId },
        (response) => {
          if (response.success) {
            this.lobbyId = lobbyId;
            this.isHost = response.lobby.hostId === this.userId;
            this.players = response.lobby.players || [];
            this.hostId = response.lobby.hostId;
            console.log(
              "Lobby beigetreten Client: lobbyId=",
              this.lobbyId,
              "hostId=",
              this.hostId,
              "players=",
              this.players
            );
            resolve(response.lobby);
          } else {
            reject(
              new Error(response.error || "Fehler beim Beitreten der Lobby")
            );
          }
        }
      );
    });
  }

  /**
   * Präsentation starten (nur Host)
   */
  startPresentation() {
    if (!this.socket || !this.lobbyId) {
      console.error(
        "Nicht mit einer Lobby verbunden oder Socket nicht bereit."
      );
      return;
    }
    // Die Überprüfung, ob der User der Host ist, passiert serverseitig anhand der userId.
    // Der Client muss nur wissen, dass er die Aktion anstößt.
    console.log(
      "Versuche Präsentation zu starten als User:",
      this.userId,
      "Socket-ID:",
      this.socket.id
    );
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
      this.hostId = null; // HostID auch zurücksetzen
    }
  }
}

// Globale Instanz exportieren
window.multiplayerClient = new MultiplayerClient();
