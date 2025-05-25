# Integration des Multiplayer-Buttons

Um die Multiplayer-Funktionalität in die FreestAIle-Anwendung zu integrieren, fügen Sie den folgenden Button zur Homepage (`public/homepage.eta`) hinzu.

## 1. Multiplayer-Button hinzufügen

Suchen Sie in der `homepage.eta`-Datei nach dem Abschnitt, der die Hauptaktionen oder Buttons enthält, und fügen Sie den folgenden HTML-Code ein:

```html
<a href="/create-lobby" class="action-button multiplayer-button">
  <i class="fas fa-users"></i> Multiplayer starten
</a>
```

Stellen Sie sicher, dass der Button im selben Bereich wie andere Hauptaktionsbuttons platziert ist, damit er gut sichtbar ist.

## 2. CSS-Styling (optional)

Wenn Sie spezifisches Styling für den Multiplayer-Button wünschen, fügen Sie den folgenden CSS-Code zum Style-Block Ihrer `homepage.eta`-Datei hinzu:

```css
.multiplayer-button {
  background: linear-gradient(135deg, #b1dae7 0%, #9bc8d7 100%);
  color: #234567;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.multiplayer-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
  background: linear-gradient(135deg, #9bc8d7 0%, #8ab6c5 100%);
}
```

## 3. Testen

Nach dem Hinzufügen des Buttons:

1. Starten Sie die Anwendung mit `npm run dev`
2. Öffnen Sie die Homepage im Browser
3. Klicken Sie auf den "Multiplayer starten"-Button
4. Sie sollten zur Lobby-Seite mit einem generierten QR-Code weitergeleitet werden
5. Scannen Sie den QR-Code mit einem Mobilgerät oder öffnen Sie die Join-URL in einem anderen Browser, um als Client beizutreten

## Hinweis

Die Route `/create-lobby` ist bereits in der `main.js`-Datei implementiert und leitet den Benutzer zur Lobby-Seite mit einer neu generierten Lobby-ID weiter.
