// Teilnehmerliste aktualisieren
function updateParticipantsList(players, hostId, currentUserId) {
  const participantsList = document.getElementById("participants-list");
  if (participantsList) {
    participantsList.innerHTML = "";

    // Sortiere Spieler, sodass der Host (falls vorhanden) und der aktuelle Benutzer oben sind
    const sortedPlayers = [...players].sort((a, b) => {
      if (a.id === hostId && b.id !== hostId) return -1;
      if (a.id !== hostId && b.id === hostId) return 1;
      if (a.id === currentUserId && b.id !== currentUserId) return -1;
      if (a.id !== currentUserId && b.id === currentUserId) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    sortedPlayers.forEach((player) => {
      const playerElement = document.createElement("div");
      playerElement.className = "participant";
      playerElement.textContent = player.name || "Unbenannter Spieler"; // Fallback für Namen

      if (player.id === currentUserId) {
        playerElement.className += " current-user";
        playerElement.textContent += " (Du)"; // Kennzeichnung für aktuellen Nutzer
      }
      if (player.id === hostId) {
        playerElement.className += " host";
      }
      participantsList.appendChild(playerElement);
    });
  }
}

// Initialisiere die Teilnehmerliste, wenn der Client verbunden ist
document.addEventListener("DOMContentLoaded", () => {
  // Stellen Sie sicher, dass Benutzerdaten verfügbar sind, bevor Sie fortfahren
  // Diese müssen von Ihrer Hauptanwendungslogik bereitgestellt werden, z.B. nach dem Login
  // Beispiel: Annahme, dass user Objekt mit id und email (für Name) im globalen Scope ist
  let currentUserId = null;
  let currentUserName = "Gast"; // Standardname

  // VERSUCHEN SIE, DIE BENUTZERDATEN AUS DEM AUTHENTIFIZIERUNGSKONTEXT ZU LADEN
  // Dieser Teil ist spezifisch für Ihre Anwendung und wie Sie Benutzerdaten speichern.
  // Beispiel: Wenn Sie Benutzerdaten in `window.currentUser` speichern:
  if (window.currentUser && window.currentUser.id) {
    currentUserId = window.currentUser.id;
    currentUserName =
      window.currentUser.email || window.currentUser.name || "Benutzer";
  } else {
    // Fallback oder Fehlerbehandlung, wenn keine Benutzerdaten gefunden wurden
    // Für dieses Beispiel verwenden wir eine generierte ID, aber in Produktion sollten Sie echte IDs verwenden
    console.warn(
      "Keine globalen Benutzerdaten gefunden. Verwende generierte ID für MultiplayerClient.setUser."
    );
    currentUserId =
      localStorage.getItem("tempUserId") || `tempUser_${Date.now()}`;
    localStorage.setItem("tempUserId", currentUserId);
    currentUserName =
      localStorage.getItem("tempUserName") ||
      `Gast_${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem("tempUserName", currentUserName);
  }

  if (!window.multiplayerClient) {
    console.error("MultiplayerClient ist nicht initialisiert!");
    return;
  }

  // Benutzerdaten im MultiplayerClient setzen
  window.multiplayerClient.setUser(currentUserId, currentUserName);

  // Socket-Verbindung herstellen
  window.multiplayerClient
    .connect()
    .then(() => {
      console.log("Socket-Verbindung erfolgreich hergestellt.");
      // Hier könnten Sie Logik zum automatischen Erstellen/Beitreten einer Lobby hinzufügen,
      // basierend auf URL-Parametern oder Session-Daten.
      // Beispiel: lobbyId aus URL holen, falls vorhanden
      const urlParams = new URLSearchParams(window.location.search);
      const lobbyIdFromUrl = urlParams.get("lobbyId") || urlParams.get("id");

      if (lobbyIdFromUrl) {
        console.log(`Versuche Lobby ${lobbyIdFromUrl} beizutreten...`);
        window.multiplayerClient
          .joinLobby(lobbyIdFromUrl, currentUserName)
          .then((lobbyData) => {
            console.log(
              `Erfolgreich Lobby ${lobbyIdFromUrl} beigetreten:`,
              lobbyData
            );
            refreshParticipantsList();
          })
          .catch((err) => {
            console.error(
              `Fehler beim Beitreten der Lobby ${lobbyIdFromUrl}:`,
              err
            );
            // UI-Feedback für den Benutzer, z.B. Weiterleitung oder Fehlermeldung
          });
      } else {
        // Wenn keine Lobby-ID in der URL ist, könnte hier die Logik zum Erstellen einer neuen Lobby stehen,
        // oder die Anzeige einer Auswahlmöglichkeit.
        console.log(
          "Keine Lobby-ID in URL gefunden. UI sollte Erstellen/Beitreten anbieten."
        );
        // Initial die Liste leeren oder mit Platzhalter füllen, falls noch keine Spielerdaten da sind
        refreshParticipantsList();
      }
    })
    .catch((err) => {
      console.error("Fehler bei der Socket-Verbindung:", err);
      // UI-Feedback für den Benutzer
    });

  const refreshParticipantsList = () => {
    if (window.multiplayerClient) {
      updateParticipantsList(
        window.multiplayerClient.players || [],
        window.multiplayerClient.hostId,
        window.multiplayerClient.userId // Die ID des aktuellen Benutzers
      );
    }
  };

  if (window.multiplayerClient) {
    window.multiplayerClient.on("connect", () => {
      console.log("Event: 'connect' empfangen von multiplayerClient.");
      refreshParticipantsList();
    });

    window.multiplayerClient.on("playerJoined", (playerInfo) => {
      console.log(
        "Event: 'playerJoined' empfangen",
        playerInfo,
        "Akt. Spieler:",
        window.multiplayerClient.players
      );
      refreshParticipantsList();
    });

    window.multiplayerClient.on("playerLeft", (playerInfo) => {
      console.log(
        "Event: 'playerLeft' empfangen",
        playerInfo,
        "Akt. Spieler:",
        window.multiplayerClient.players
      );
      refreshParticipantsList();
    });

    window.multiplayerClient.on("hostDisconnected", (data) => {
      console.log("Event: 'hostDisconnected' empfangen", data);
      // Optional: UI anpassen, z.B. Hinweis, dass Host weg ist
      refreshParticipantsList(); // Liste neu zeichnen, um ggf. Host-Status zu aktualisieren
    });

    // Initialer Aufruf, um die Liste zu zeichnen, falls Daten schon da sind (z.B. nach joinLobby)
    // Dies wird nun eher durch die .then() Kette von connect() und joinLobby() gehandhabt.
    // refreshParticipantsList();
  } else {
    console.warn(
      "MultiplayerClient nicht initialisiert beim DOMContentLoaded."
    );
  }
});
