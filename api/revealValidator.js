/**
 * Validator für Reveal.js Präsentationen
 * Überprüft HTML auf korrekte Struktur für Reveal.js
 */

/**
 * Validiert HTML für Reveal.js Präsentationen
 * @param {string} html - Das zu validierende HTML
 * @returns {boolean} - true wenn die Validierung erfolgreich ist
 * @throws {Error} - Wenn die Validierung fehlschlägt mit einer Fehlermeldung
 */
export function validateRevealSlides(html) {
  if (!html || typeof html !== "string") {
    throw new Error("HTML muss ein nicht-leerer String sein");
  }

  //   console.log("Wird validiert");

  // Regel a: Das erste nicht-whitespace Zeichen muss < sein
  const trimmedHtml = html.trim();
  if (!trimmedHtml.startsWith("<")) {
    throw new Error("HTML muss mit einem Element-Tag beginnen, nicht mit Text");
  }

  // Regel b: Überprüfe auf ausgewogene Tags
  const voidElements = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);

  const stack = [];
  let i = 0;

  while (i < trimmedHtml.length) {
    // Suche nach öffnenden Tags
    if (
      trimmedHtml[i] === "<" &&
      trimmedHtml[i + 1] !== "/" &&
      trimmedHtml[i + 1] !== "!"
    ) {
      let j = i + 1;
      // Finde das Ende des Tag-Namens
      while (j < trimmedHtml.length && !/[\s>]/.test(trimmedHtml[j])) {
        j++;
      }

      const tagName = trimmedHtml.substring(i + 1, j).toLowerCase();

      // Finde das Ende des Tags
      while (j < trimmedHtml.length && trimmedHtml[j] !== ">") {
        j++;
      }

      // Überprüfe, ob es ein selbstschließendes Tag ist
      const isSelfClosing =
        trimmedHtml[j - 1] === "/" || voidElements.has(tagName);

      if (!isSelfClosing) {
        stack.push(tagName);
      }

      i = j + 1;
    }
    // Suche nach schließenden Tags
    else if (trimmedHtml[i] === "<" && trimmedHtml[i + 1] === "/") {
      let j = i + 2;
      while (j < trimmedHtml.length && trimmedHtml[j] !== ">") {
        j++;
      }

      const closingTag = trimmedHtml.substring(i + 2, j).toLowerCase();

      if (stack.length === 0 || stack[stack.length - 1] !== closingTag) {
        throw new Error(
          `Unausgewogene Tags: Ein schließendes </${closingTag}> gefunden, aber das zuletzt geöffnete Tag war ${
            stack.length ? stack[stack.length - 1] : "nicht vorhanden"
          }`
        );
      }

      stack.pop();
      i = j + 1;
    }
    // Kommentare oder andere Elemente überspringen
    else if (trimmedHtml[i] === "<" && trimmedHtml[i + 1] === "!") {
      let j = i + 2;
      while (
        j < trimmedHtml.length &&
        !(
          trimmedHtml[j - 2] === "-" &&
          trimmedHtml[j - 1] === "-" &&
          trimmedHtml[j] === ">"
        )
      ) {
        j++;
      }
      i = j + 1;
    } else {
      i++;
    }
  }

  if (stack.length > 0) {
    throw new Error(
      `Unausgewogene Tags: ${stack.join(", ")} wurden nicht geschlossen`
    );
  }

  // Regel c: Überprüfe auf Reveal-Container und Section-Elemente
  const revealRegex = /<div[^>]*class\s*=\s*["'][^"']*reveal[^"']*["'][^>]*>/i;
  if (!revealRegex.test(trimmedHtml)) {
    throw new Error(
      'HTML muss ein Root-Element mit der Klasse "reveal" enthalten'
    );
  }

  const sectionRegex = /<section[^>]*>/i;
  if (!sectionRegex.test(trimmedHtml)) {
    throw new Error("HTML muss mindestens ein <section>-Element enthalten");
  }

  return true;
}

// Alternative Implementierung mit DOMParser (für Browser) oder JSDOM (für Node)
function validateRevealSlidesWithDOM(html) {
  let parser;
  let doc;

  // Browser-Umgebung
  if (typeof window !== "undefined" && window.DOMParser) {
    parser = new DOMParser();
    doc = parser.parseFromString(html, "text/html");
  }
  // Node.js-Umgebung (benötigt jsdom als Abhängigkeit)
  else if (typeof require !== "undefined") {
    try {
      const { JSDOM } = require("jsdom");
      const dom = new JSDOM(html);
      doc = dom.window.document;
    } catch (e) {
      throw new Error(
        "JSDOM ist nicht verfügbar. Bitte installieren Sie es mit npm install jsdom"
      );
    }
  } else {
    throw new Error("Keine geeignete Parsing-Umgebung gefunden");
  }

  // Regel a: Das erste nicht-whitespace Zeichen muss < sein
  const trimmedHtml = html.trim();
  if (!trimmedHtml.startsWith("<")) {
    throw new Error("HTML muss mit einem Element-Tag beginnen, nicht mit Text");
  }

  // Regel c: Überprüfe auf Reveal-Container und Section-Elemente
  const revealElement = doc.querySelector(".reveal");
  if (!revealElement) {
    throw new Error('HTML muss ein Element mit der Klasse "reveal" enthalten');
  }

  const sectionElements = revealElement.querySelectorAll("section");
  if (sectionElements.length === 0) {
    throw new Error(
      "HTML muss mindestens ein <section>-Element innerhalb des .reveal-Elements enthalten"
    );
  }

  return true;
}

// Exportiere die Funktionen für die Verwendung in Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    validateRevealSlides,
    validateRevealSlidesWithDOM,
  };
}

// Beispielverwendung:
/*
try {
  // Angenommen generateSlides() ist eine Funktion, die von einer KI bereitgestellt wird
  const slides = generateSlides();
  validateRevealSlides(slides);
  console.log('Die Präsentation ist gültig!');
} catch (error) {
  console.error('Validierungsfehler:', error.message);
  // Fehlerbehandlung hier - z.B. Anzeigen eines Fehlers in der UI
  // oder Generieren einer Fallback-Präsentation
}
*/
