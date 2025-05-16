// const { validateRevealSlides } = require("./revealValidator");

// function generateSlides(topic = "Beispielthema") {
//   return `
// <div class="container">
//   <div class="presentation-container" id="presentation-container">
//     <div class="reveal">
//       <div class="slides">
//         <section>
//           <h2>${topic}</h2>
//           <ul>
//             <li>Punkt 1 zum Thema ${topic}</li>
//             <li>Punkt 2 zum Thema ${topic}</li>
//             <li>Punkt 3 zum Thema ${topic}</li>
//           </ul>
//         </section>

//         <section>
//           <h2>Zweite Folie</h2>
//           <p>Weiterer Inhalt zur Präsentation</p>
//         </section>
//       </div>
//     </div>
//   </div>
// </div>`;
// }

// function generateInvalidSlides() {
//   return `
// Text am Anfang (ungültig)
// <div class="container">
//   <div class="presentation-container" id="presentation-container">
//     <div class="slides">
//       <section>
//         <h2>Ungültige Folie</h2>
//       </section>
//     </div>
//   </div>
// </div>`;
// }

// function exampleUsage() {
//   try {
//     const slides = generateSlides("JavaScript");
//     validateRevealSlides(slides);
//     console.log("Die Präsentation ist gültig!");
//   } catch (error) {
//     console.error("Validierungsfehler:", error.message);
//   }
// }

// function testInvalidSlides() {
//   try {
//     const invalidSlides = generateInvalidSlides();
//     validateRevealSlides(invalidSlides);
//     console.log("Die Präsentation ist gültig!");
//   } catch (error) {
//     console.error("Erwarteter Validierungsfehler:", error.message);
//     const fallbackSlides = generateSlides("Fallback-Thema");
//     console.log("Fallback-Präsentation generiert.");
//   }
// }

// console.log("=== Beispiel mit gültigen Folien ===");
// exampleUsage();

// console.log("\n=== Beispiel mit ungültigen Folien ===");
// testInvalidSlides();
