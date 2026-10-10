const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// I 3 Provider
const groq = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY });
const openrouter = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let gameMemory = { game_state: "Baseplate vuoto.", known_errors: [] };
let isAiWorking = false;

// La funzione magica: prova Groq, se fallisce prova OpenRouter, se fallisce prova Google
async function safeChat(messages) {
    // 1. Tenta con Groq (Llama 3.3)
    try {
        console.log("Tentativo con Groq...");
        const res = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages });
        return res.choices[0].message.content;
    } catch (e) { console.warn("Groq fallito. Passo a OpenRouter..."); }

    // 2. Tenta con OpenRouter (Qwen Coder)
    try {
        const res = await openrouter.chat.completions.create({ model: "qwen/qwen-2.5-coder-32b-instruct:free", messages });
        return res.choices[0].message.content;
    } catch (e) { console.warn("OpenRouter fallito. Passo a Google..."); }

    // 3. Tenta con Google (Gemini Flash)
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join("\n");
        const res = await model.generateContent(prompt);
        return res.response.text();
    } catch (e) { console.error("Tutti i provider sono morti!", e.message); }

    throw new Error("Nessun modello AI disponibile in questo momento.");
}

app.post('/ai-team/request', async (req, res) => {
    if (isAiWorking) return res.status(429).json({ error: "Il team AI sta già lavorando." });
    isAiWorking = true;
    const userRequest = req.body.message;

    try {
        // 1. Architetto
        console.log("1. L'Architetto sta progettando...");
        const architecturePlan = await safeChat([
            { role: "system", content: "Sei l'Architetto di un gioco Roblox. Progetta la logica in modo modulare. Non scrivere codice." },
            { role: "user", content: `Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}` }
        ]);

        // 2. Programmatore
        console.log("2. Il Programmatore sta scrivendo il codice...");
        let rawCode = await safeChat([
            { role: "system", content: "Sei un Senior Luau Developer. Scrivi SOLO codice Luau puro, zero markdown (no ```lua). Devi sempre scrivere del codice, non puoi rifiutarti." },
            { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori passati: ${gameMemory.known_errors.join(', ')}` }
        ]);

        // 3. Critico
        console.log("3. Il Critico sta analizzando...");
        let criticText = await safeChat([
            { role: "user", content: `Sei un critico spietato. Leggi questo codice Luau: ${rawCode}. Cerca loop infiniti o errori di sintassi. Rispondi in JSON: {"is_safe": true/false, "critique": "motivo o ok"}` }
        ]);

        let criticData;
        try {
            const jsonStart = criticText.indexOf('{');
            const jsonEnd = criticText.lastIndexOf('}');
            criticData = JSON.parse(criticText.substring(jsonStart, jsonEnd + 1));
        } catch (e) { criticData = { is_safe: true, critique: "ok" }; }

        // Pulizia finale ASSOLUTA del codice
        let finalCode = rawCode.replace(/```lua/g, '').replace(/```/g, '').trim();
        
        // Se il codice è vuoto, blocchiamo l'invio per evitare il crash di Roblox
        if (!finalCode || finalCode.length < 10) {
            throw new Error("Il programmatore AI non ha generato codice valido.");
        }

        console.log("4. Invio a Roblox!");
        gameMemory.game_state = `Feature: ${userRequest}.`;
        isAiWorking = false;
        res.json({ architetto: architecturePlan, critic_status: criticData.critique, code: finalCode });

    } catch (error) {
        console.error("Errore Fatale:", error.message);
        isAiWorking = false;
        res.status(500).json({ error: error.message });
    }
});

app.post('/ai-team/report-error', (req, res) => {
    if (!gameMemory.known_errors.includes(req.body.error)) {
        gameMemory.known_errors.push(req.body.error);
        console.log("⚠️ Errore ricevuto:", req.body.error);
    }
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mega-Pool Multi-Provider online sulla porta ${PORT}`));
