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
    "The presentation is for a PowerPoint Karaoke game. This means the content on each slide (titles, bullet points, table content) MUST be:\\n" +
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
    "    *   It should ONLY contain the main topic (e.g., in an \`<h1>\`), a very funny, short, and catchy subtitle/tagline (e.g., in an \`<h2>\`) and one or two images depicting what content is about to come.\\n" +
    "    *   Example for first slide content (inside its \`<section>\`): \`<h1>Cats vs. Dogs<\\\\/h1><h2>War of the Paws - An Unbiased Investigation<\\\\/h2><img data-motif='cat+and+dog'>\` Don't give a 'src' for the \`<img>\`, just name the object to be seen (so it can be retrieved from Pixabay) in the 'data-motif' attribute\\n" +
    "4.  **Content Slides (Slides 2 to ~10):**\\n" +
    "    *   Each of these slides should have a funny/intriguing title (e.g., in an \`<h2>\` or \`<h3>\`).\\n" +
    "    *   Each content slide should present its humorous content using **EITHER** 4 to 7 bullet points (\`<ul><li>...<\\\\/li><\\\\/ul>\`) **OR** a **table** (\`<table><thead><tr><th>Aspect 1<\\\\/th><th>Aspect 2<\\\\/th><\\\\/tr><\\\\/thead><tbody><tr><td>Hilarious Point A<\\\\/td><td>Surprising Counterpoint A<\\\\/td><\\\\/tr><tr><td>Absurdity B<\\\\/td><td>Witty Take B<\\\\/td><\\\\/tr><!-- more rows as needed --><\\\\/tbody><\\\\/table>\`) for contrasting or comparing funny ideas. \\n" +
    "    *   **Strongly consider using tables** whenever they can effectively enhance the comedic effect through comparison or contrast (aim for tables with 2-4 rows and 2-3 columns if used). Strive to include tables on several slides to ensure variety and specifically address the interest in table-based content, but prioritize what makes the slide funnier.\\n" +
    "    *   Table cells and bullet points should be concise, humorous, and unexpected, fitting the PowerPoint Karaoke style.\\n" +
    "    *   Additionally, every slide should have 1 to 3 images. Don't give a 'src', just use keywords to describe the motif of the image (so it can be retrieved from Pixabay) in a 'data-motif' attribute of the \`<img>\`, separated by '+'. For example: \`<img data-motif='cats+dogs+cute'>\`\\n" +
    "    *   Please format the slides correctly so that the images don't push the text out of the screen\\n" +
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
    "            <img data-motif='relevant+image+for+topic'>\\n" +
    "          <\\\\/section>\\n" +
    "          <section>\\n" +
    "            <h2>[Witty Slide Title 2 - Table Example if it fits well]<\\\\/h2>\\n" +
    "            <table>\\n" +
    "              <thead>\\n" +
    "                <tr><th>Category of Nonsense<\\\\/th><th>Even More Nonsense<\\\\/th><\\\\/tr>\\n" +
    "              <\\\\/thead>\\n" +
    "              <tbody>\\n" +
    "                <tr><td>Why chickens cross roads<\\\\/td><td>To file a complaint about the potholes<\\\\/td><\\\\/tr>\\n" +
    "                <tr><td>Existential angst of a toaster<\\\\/td><td>It's always crummy in the morning<\\\\/td><\\\\/tr>\\n" +
    "              <\\\\/tbody>\\n" +
    "            <\\\\/table>\\n" +
    "            <img data-motif='confused+person+looking+at+chart'>\\n" +
    "          <\\\\/section>\\n" +
    "          <section>\\n" +
    "            <h2>[Witty Slide Title 3 - Bullet Point Example if it fits well]<\\\\/h2>\\n" +
    "            <ul>\\n" +
    "              <li>Unexpectedly hilarious bullet point 1<\\\\/li>\\n" +
    "              <li>An absurd but topic-related fact 2<\\\\/li>\\n" +
    "              <li>A bafflingly funny observation 3<\\\\/li>\\n" +
    "            <\\\\/ul>\\n" +
    "            <img data-motif='rubber+duck+in+space'>\\n" +
    "          <\\\\/section>\\n" +
    "          <!-- ... and so on for approx. 7 more sections, using tables or bullet points as best fits the humor ... -->\\n" +
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
    "Again, do NOT use ```html ... ```, but just give me the code."
}

export async function fetchImages(motifs) {
    let images = [];
    for (const motif of motifs) {
        let i = await fetchImage(motif);
        images.push(i);
    }
    console.log(images);
    return images;
}

async function fetchImage(motif) {
    const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${motif}&lang=en&per_page=3`;
    const options = {method: 'GET'};

    try {
        const response = await fetch(url, options);
        if (response.ok) {

            const json = await response.json();
            let link = json.hits?.[0]?.webformatURL;
            console.log(link);

            if (link === undefined || link === null) {
                console.error(response);
                return;
            }

            console.log("" + motif + link)

            return link;

        } else {
            console.log(response.statusCode);
            return 'Not 200';
        }
    } catch (error) {
        console.error(error);
    }
}
