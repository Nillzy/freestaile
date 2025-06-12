import { validateRevealSlides } from "./revealValidator.js";
import { GoogleGenAI } from "@google/genai";

export async function fetchSlides(topic, presentationLanguage, tryCount = 1) {

    const prompt = buildPrompt(topic, presentationLanguage);

    const geminiAPI = async () => {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const delay = ms => new Promise(res => setTimeout(res, ms));
        const maxAttempts = 5;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                });

                if (!response || !response.text) {
                    throw new Error("Gemini API Error: No response");
                }

                let content = response.text.toString();

                if (content === "NO_SLIDE\n" || content === "NO_SLIDE") {
                    throw new Error("AI responded with 'NO_SLIDE'.");
                }

                content = content.replace("```html", "").replace("```", "");
                validateRevealSlides(content);
                return content;

            } catch (error) {
                console.error(`Gemini API Error (Attempt ${attempt}): ${error.message}`);
                if (attempt < maxAttempts) {
                    await delay(5000); // 5 Sekunden warten vor dem nächsten Versuch
                } else {
                    throw new Error("Gemini API failed after multiple attempts.");
                }
            }
        }
    };


    const deepSeekAPI = async () => {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const delay = ms => new Promise(res => setTimeout(res, ms));
        const maxAttempts = 5;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {

                const url = 'https://openrouter.ai/api/v1/chat/completions';

                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        "model": "deepseek/deepseek-r1-0528-qwen3-8b:free",
                        "messages": [
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ]
                    })
                });

                console.log(response);

                if (!response.ok) {
                    throw new Error("Response was not ok");
                }

                const json = await response.json();
                if (!json.choices || !json.choices[0].message || !json.choices[0].message.content) {
                    throw new Error("json.choices[0].message.content was not defined");
                }
                let content =  json.choices[0].message.content;

                if (content === "NO_SLIDE\n" || content === "NO_SLIDE") {
                    console.error("AI responded with 'NO_SLIDE'.");
                    throw new Error("AI responded with 'NO_SLIDE'.");
                }

                content = content.replace("```html", "");
                content = content.replace("```", "");

                validateRevealSlides(content);
                return content;

            } catch (error) {
                console.error(`DeepSeek API Error (Attempt ${attempt}): ${error.message}`);
                if (attempt < maxAttempts) {
                    await delay(5000); // 5 Sekunden warten vor dem nächsten Versuch
                } else {
                    throw new Error("DeepSeek API failed after multiple attempts.");
                }
            }
        }
    }

    const timeoutHandler = () => {
        return "<h2 style='text-align: center'>Neither Google Gemini nor DeepSeek could generate a presentation about the given topic '" + topic + "' after several tries. Please try again later or try another topic.</h2>";
    }

    return await Promise.race([
        geminiAPI(),
        deepSeekAPI(),
        new Promise((_, reject) =>
            setTimeout(() => reject(timeoutHandler()), 120000)
        )
    ]);
}

function buildPrompt(topic, presentationLanguage) {
    return "### ROLE ###\\n" +
        "You are an expert RevealJS slide content generator. Your specialty is creating hilarious and unexpected presentations suitable for PowerPoint Karaoke.\\n" +
        "\\n" +
        "### TASK ###\\n" +
        "Generate the full HTML structure for a RevealJS presentation about the topic \\\"" + topic + "\\\".\\n" +
        "IMPORTANT: The ENTIRE presentation MUST be in " + presentationLanguage + " language. This includes ALL text content: titles, subtitles, bullet points, and table content. If no language is specified, use English as the default language.\\n" +
        "The presentation is for a PowerPoint Karaoke game. This means the content on each slide (titles, bullet points, table content) MUST be:\\n" +
        "- Funny and witty\\n" +
        "- Contain unexpected twists or surprising facts\\n" +
        "- Make absurd connections (while still being loosely related to the topic)\\n" +
        "- Be generally humorous and engaging for a live audience trying to improvise.\\n" +
        "\\n" +
        "### REQUIREMENTS ###\\n" +
        "1.  **Topic:** " + topic + "\\n" +
        "2.  **Language:** The ENTIRE presentation MUST be in " + presentationLanguage + " language. If no language is specified, use English as the default language. This is a strict requirement.\\n" +
        "3.  **Number of Slides:** Generate approximately 10 slides in total. Each slide is a \`<section>\` element, placed inside the \`<div class=\\\"slides\\\">\` container.\\n" +
        "4.  **Content Length & Formatting:**\\n" +
        "    *   Keep content concise but allow for some flexibility.\\n" +
        "    *   Slide titles should be brief but impactful (max 7 words).\\n" +
        "    *   Bullet points and table cells should be concise (max 9-11 words) while maintaining humor.\\n" +
        "    *   Adjust image sizes using inline styles (e.g., \`style='max-width: 660px; max-height: 440px;'\`) if needed to prevent content overflow.\\n" +
        "5.  **First Slide (Title Slide):**\\n" +
        "    *   Must be the first \`<section>\`.\\n" +
        "    *   It should contain the main topic (max 7 words) in an \`<h1>\`, a catchy subtitle (max 7 words) in an \`<h2>\`, and one or two appropriately sized images.\\n" +
        "    *   Example for first slide content (inside its \`<section>\`): \`<h1>The Epic Cats vs Dogs Battle<\\\\/h1><h2>The Ultimate Furry Showdown Begins<\\\\/h2><img data-motif='cat+dog' style='max-width: 660px; max-height: 440px;'>\`\\n" +
        "6.  **Content Slides (Slides 2 to ~10):**\\n" +
        "    *   Each slide should have a witty title (max 7 words) in an \`<h2>\` or \`<h3>\`.\\n" +
        "    *   Use either 4-7 bullet points or a table (2-3 columns, 2-4 rows) with engaging content.\\n" +
        "    *   Keep text content concise but expressive - each bullet point or table cell should be maximum 9-11 words.\\n" +
        "    *   Include 1-2 appropriately sized images per slide using the \`data-motif\` attribute and inline styles for size control.\\n" +
        "    *   Example image: \`<img data-motif='cats+dogs+cute' style='max-width: 550px; max-height: 330px;'>\`\\n" +
        "7.  **Presentation Language:** " + presentationLanguage + "(definition of the language in the language itself)" + "\\n" +
        "\\n" +
        "### OUTPUT FORMAT & STRICT INSTRUCTIONS ###\\n" +
        "- **OUTPUT ONLY VALID HTML:** You must only output the complete HTML structure as specified below.\\n" +
        "- **INCLUDE WRAPPERS:** Your output MUST include the following four outer div wrappers: \`<div class=\\\"container\\\">\`, \`<div class=\\\"presentation-container\\\" id=\\\"presentation-container\\\">\`, \`<div class=\\\"reveal\\\">\`, and \`<div class=\\\"slides\\\">\`. The \`<section>\` elements for the slides go inside \`<div class=\\\"slides\\\">\`.\\n" +
        "- **STRICTLY FORBIDDEN HTML TAGS:** The following tags are STRICTLY FORBIDDEN and must NEVER appear in your output: \`<html>\`, \`<head>\`, \`<body>\`, \`</html>\`, \`</head>\`, \`</body>\`. Your output must start directly with \`<div class=\\\"container\\\">\` and end with \`</div>\`.\\n" +
        "- **NO OTHER HTML ELEMENTS:** Do NOT include any other HTML elements outside the specified structure.\\n" +
        "- **NO MARKDOWN:** Do NOT use Markdown syntax. Output the HTML code directly. Do not even use '```html ... ```' \\n" +
        "- **NO EXTRA TEXT:** Do NOT include any explanations, apologies, introductory or concluding remarks, or any text outside the main HTML structure. Just the HTML.\\n" +
        "- **HTML STRUCTURE EXAMPLE (Complete output expected):**\\n" +
        "  <div class=\\\"container\\\">\\n" +
        "    <div class=\\\"presentation-container\\\" id=\\\"presentation-container\\\">\\n" +
        "      <div class=\\\"reveal\\\">\\n" +
        "        <div class=\\\"slides\\\">\\n" +
        "          <section>\\n" +
        "            <h1>Engaging and Fun Topic Title<\\\\/h1>\\n" +
        "            <h2>Funny and Memorable Tagline Here<\\\\/h2>\\n" +
        "            <img data-motif='relevant+image' style='max-width: 660px; max-height: 440px;'>\\n" +
        "          <\\\\/section>\\n" +
        "          <section>\\n" +
        "            <h2>Witty and Engaging Slide Title<\\\\/h2>\\n" +
        "            <table style='font-size: 1em;'>\\n" +
        "              <thead>\\n" +
        "                <tr><th>Engaging and Funny Header 1<\\\\/th><th>Witty Header Number Two<\\\\/th><\\\\/tr>\\n" +
        "              <\\\\/thead>\\n" +
        "              <tbody>\\n" +
        "                <tr><td>Funny and engaging point with humor<\\\\/td><td>Witty counterpoint that makes you laugh<\\\\/td><\\\\/tr>\\n" +
        "                <tr><td>Humorous observation about the topic<\\\\/td><td>Clever response that surprises everyone<\\\\/td><\\\\/tr>\\n" +
        "              <\\\\/tbody>\\n" +
        "            <\\\\/table>\\n" +
        "            <img data-motif='confused+person' style='max-width: 550px; max-height: 330px;'>\\n" +
        "          <\\\\/section>\\n" +
        "          <section>\\n" +
        "            <h2>Funny and Engaging Slide Title<\\\\/h2>\\n" +
        "            <ul style='font-size: 1.1em;'>\\n" +
        "              <li>Engaging and humorous point with a twist<\\\\/li>\\n" +
        "              <li>Funny and relevant fact that surprises you<\\\\/li>\\n" +
        "              <li>Witty observation that makes everyone laugh<\\\\/li>\\n" +
        "            <\\\\/ul>\\n" +
        "            <img data-motif='rubber+duck' style='max-width: 440px; max-height: 330px;'>\\n" +
        "          <\\\\/section>\\n" +
        "          <!-- ... and so on for approx. 7 more sections, using tables or bullet points as best fits the humor ... -->\\n" +
        "        <\\\\/div>\\n" +
        "      <\\\\/div>\\n" +
        "    <\\\\/div>\\n" +
        "  <\\\\/div>\\n" +
        "\\n" +
        "### ERROR HANDLING ###\\n" +
        "- If you cannot understand the topic, or if you are unwilling or unable to create a presentation on the given topic in the requested humorous style and according to all requirements, reply ONLY with the exact string \\\"NO_SLIDE\\\" and nothing else." + "\\n" +
        "- If no language is specified, use English as the default language. Do NOT write 'NO LANGUAGE' on the first slide in this case." + "\\n" +
        "\\n" +
        "Begin generation for topic: \\\"" + topic + "\\\""
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
