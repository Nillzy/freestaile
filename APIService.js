import { validateRevealSlides } from "./revealValidator.js";
// import { exampleUsage, testInvalidSlides } from "./revealValidatorExample.js";

const MAX_RETRIES = 3;

export async function fetchSlides(topic, retryCount = 0) {

    const prompt = buildPrompt(topic);

    /*const url = 'https://openrouter.ai/api/v1/chat/completions';
    const options = {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: '{"model":"deepseek/deepseek-chat-v3-0324:free","messages":[{"role":"user","content":[{"type":"text","text":"' + prompt + '"}]}]}'
    };*/

    /*try {
        const response = await fetch(url, options);
        if (response.ok) {
            const json = await response.json();
            const content = json.choices?.[0]?.message?.content;
            console.log(json);
            return content;
        } else {
            console.log(response.
            return '';
        }
    } catch (error) {
        console.error(error);
    }*/

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    };

    try {
        const response = await fetch(url, options);
        if (response.ok) {
            const json = await response.json();
            let content = json.candidates[0].content.parts[0].text;
            console.log(content);

            if (content === undefined || content === null) {
                console.error(response);
                return;
            }

            content = content.replace("```html", "")
            content = content.replace("```", "")

            try {
                validateRevealSlides(content);
                return content;
            } catch (validationError) {
                console.error(
                    `Validierungsfehler (Versuch ${retryCount + 1}/${MAX_RETRIES}):`,
                    validationError.message
                );

                if (retryCount < MAX_RETRIES) {
                    console.log(
                        `Starte erneuten Versuch ${retryCount + 1}/${MAX_RETRIES}...`
                    );
                    return fetchSlides(topic, retryCount + 1);
                } else {
                    console.log(
                        `Maximale Anzahl von Versuchen (${MAX_RETRIES}) erreicht. Letzter Fehler: ${validationError.message}`
                    );
                }
            }

        } else {
            console.log(response.statusCode);
            return 'Not 200';
        }

    } catch (error) {
        console.error(error);
    }
}

function buildPrompt(topic) {
    return "### ROLE ###\\n" +
        "You are an expert RevealJS slide content generator. Your specialty is creating hilarious and unexpected presentations suitable for PowerPoint Karaoke.\\n" +
        "\\n" +
        "### TASK ###\\n" +
        "Generate the full HTML structure for a RevealJS presentation about the topic: \\\"" + topic + "\\\".\\n" +
        "The presentation is for a PowerPoint Karaoke game. This means the content on each slide (titles, bullet points) MUST be:\\n" +
        "- Funny and witty\\n" +
        "- Contain unexpected twists or surprising facts\\n" +
        "- Make absurd connections (while still being loosely related to the topic)\\n" +
        "- Be generally humorous and engaging for a live audience trying to improvise.\\n" +
        "\\n" +
        "### REQUIREMENTS ###\\n" +
        "1.  **Topic:** " + topic + "\\n" +
        "2.  **Number of Slides:** Generate approximately 10 slides in total. Each slide is a \`<section>\` element, placed inside the \`<div class=\\\"slides\\\">\` container.\\n" +
        "3.  **First Slide (Title Slide):**\\n" +
        "    *   Must be the first \`<section>\`.\\n" +
        "    *   It should ONLY contain the main topic (e.g., in an \`<h1>\`) and a very funny, short, and catchy subtitle/tagline (e.g., in an \`<h2>\`).\\n" +
        "    *   Example for first slide content (inside its \`<section>\`): \`<h1>Cats vs. Dogs<\\\\/h1><h2>War of the Paws - An Unbiased Investigation<\\\\/h2>\`\\n" +
        "4.  **Content Slides (Slides 2 to ~10):**\\n" +
        "    *   Each of these slides should have a funny/intriguing title (e.g., in an \`<h2>\` or \`<h3>\`).\\n" +
        "    *   Each content slide must contain 4 to 7 bullet points (\`<ul><li>...<\\\\/li><\\\\/ul>\`).\\n" +
        "    *   Bullet points should be concise, humorous, and unexpected, fitting the PowerPoint Karaoke style.\\n" +
        "\\n" +
        "### OUTPUT FORMAT & STRICT INSTRUCTIONS ###\\n" +
        "- **OUTPUT ONLY VALID HTML:** You must only output the complete HTML structure as specified below.\\n" +
        "- **INCLUDE WRAPPERS:** Your output MUST include the following four outer div wrappers: \`<div class=\\\"container\\\">\`, \`<div class=\\\"presentation-container\\\" id=\\\"presentation-container\\\">\`, \`<div class=\\\"reveal\\\">\`, and \`<div class=\\\"slides\\\">\`. The \`<section>\` elements for the slides go inside \`<div class=\\\"slides\\\">\`.\\n" +
        "- **NO OTHER HTML ELEMENTS:** Do NOT include \`<html>\`, \`<head>\`, or \`<body>\` tags.\\n" +
        "- **NO MARKDOWN:** Do NOT use Markdown syntax. Output the HTML code directly. Do not even use '```html ... ```' \\n" +
        "- **NO EXTRA TEXT:** Do NOT include any explanations, apologies, introductory or concluding remarks, or any text outside the main HTML structure. Just the HTML.\\n" +
        "- **HTML STRUCTURE EXAMPLE (Complete output expected):**\\n" +
        "  \\\`\\\`\\\`html\\n" +
        "  <div class=\\\"container\\\">\\n" +
        "    <div class=\\\"presentation-container\\\" id=\\\"presentation-container\\\">\\n" +
        "      <div class=\\\"reveal\\\">\\n" +
        "        <div class=\\\"slides\\\">\\n" +
        "          <section>\\n" +
        "            <h1>" + topic + "<\\\\/h1>\\n" +
        "            <h2>[Funny and short description here, e.g., 'The Furry Showdown']<\\\\/h2>\\n" +
        "          <\\\\/section>\\n" +
        "          <section>\\n" +
        "            <h2>[Witty Slide Title 2]<\\\\/h2>\\n" +
        "            <ul>\\n" +
        "              <li>Unexpectedly hilarious bullet point 1<\\\\/li>\\n" +
        "              <li>An absurd but topic-related fact 2<\\\\/li>\\n" +
        "              <li>A bafflingly funny observation 3<\\\\/li>\\n" +
        "              <li>Why is this even a point? 4<\\\\/li>\\n" +
        "            <\\\\/ul>\\n" +
        "          <\\\\/section>\\n" +
        "          <!-- ... and so on for approx. 7 more sections ... -->\\n" +
        "        <\\\\/div>\\n" +
        "      <\\\\/div>\\n" +
        "    <\\\\/div>\\n" +
        "  <\\\\/div>\\n" +
        "  \\\`\\\`\\\`\\n" +
        "\\n" +
        "### ERROR HANDLING ###\\n" +
        "- If you cannot understand the topic, or if you are unwilling or unable to create a presentation on the given topic in the requested humorous style and according to all requirements, reply ONLY with the exact string \\\"NO_SLIDE\\\" and nothing else.\\n" +
        "\\n" +
        "Begin generation for topic: \\\"" + topic + "\\\"" +
        "Again, do NOT use ```html ... ```, but just give me the code.";
}