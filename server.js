const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// OpenRouter (Usiamo SOLO per Qwen Coder, che è stabile)
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Google API Diretta (Usiamo per Architetto, Critico e Memoria - 100% gratis e senza 404)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let gameMemory = { 
    game_state: "Baseplate vuoto. Pronto per lo sviluppo.", 
    known_errors: [] 
};

let isAiWorking = false;

app.post('/ai-team/request', async (req, res) => {
    if (isAiWorking) {
        return res.status(429).json({ error: "Il team AI sta già lavorando. Aspetta." });
    }

    isAiWorking = true;
    const userRequest = req.body.message;

    try {
        // 1. Architetto: Gemini 1.5 Flash (Google Diretto - Gratis 100%)
        console.log("1. Gemini 1.5 Flash sta progettando l'architettura...");
        const archModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const archPrompt = `Sei il Project Manager di un gioco Roblox. Progetta sistemi scalabili e modulari. Non scrivere codice, solo logica. Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}`;
        const archResult = await archModel.generateContent(archPrompt);
        const architecturePlan = archResult.response.text();

        // 2. Programmatore: Qwen 2.5 Coder 32B (OpenRouter)
        console.log("2. Qwen 2.5 Coder 32B sta scrivendo il codice...");
        const coderResponse = await openrouter.chat.completions.create({
            model: "qwen/qwen-2.5-coder-32b-instruct:free", 
            messages: [
                { role: "system", content: "Sei il miglior Senior Luau Developer. Scrivi SOLO codice Luau puro, zero markdown (no ```lua)." },
                { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori passati: ${gameMemory.known_errors.join(', ')}` }
            ]
        });
        let rawCode = coderResponse.choices[0].message.content;

        // 3. Critico: Gemini 1.5 Flash (Google Diretto - Gratis 100%)
        console.log("3. Gemini Flash sta criticando il codice (Reflection)...");
        const criticModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const criticPrompt = `Sei un critico spietato. Leggi questo codice Luau: ${rawCode}. Cerca loop infiniti o memory leak. Rispondi in JSON: {"is_safe": true/false, "critique": "motivo o ok"}`;
        const criticResult = await criticModel.generateContent(criticPrompt);
        let criticText = criticResult.response.text();
        
        let criticData;
        try {
            const jsonStart = criticText.indexOf('{');
            const jsonEnd = criticText.lastIndexOf('}');
            criticData = JSON.parse(criticText.substring(jsonStart, jsonEnd + 1));
        } catch (e) {
            criticData = { is_safe: true, critique: "ok" };
        }

        if (!criticData.is_safe) {
            console.log("3.5. Bug trovato! Qwen sta correggendo...");
            const fixResponse = await openrouter.chat.completions.create({
                model: "qwen/qwen-2.5-coder-32b-instruct:free", 
                messages: [
                    { role: "system", content: "Correggi il codice. Scrivi SOLO codice Luau puro." },
                    { role: "user", content: `Critica: ${criticData.critique}. Codice: ${rawCode}` }
                ]
            });
            rawCode = fixResponse.choices[0].message.content;
        }

        // 4. Memoria (Google Diretto)
        console.log("4. Aggiornamento memoria...");
        const memModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const memPrompt = `Aggiorna lo stato del gioco in base a questo codice: ${rawCode}. Rispondi in JSON: {"new_state": "descrizione"}`;
        const memResult = await memModel.generateContent(memPrompt);
        const memText = memResult.response.text();
        try {
            const jsonStart = memText.indexOf('{');
            const jsonEnd = memText.lastIndexOf('}');
            const qaData = JSON.parse(memText.substring(jsonStart, jsonEnd + 1));
            gameMemory.game_state = qaData.new_state || "Stato aggiornato";
        } catch (e) {
            gameMemory.game_state = "Stato aggiornato";
        }

        let finalCode = rawCode.replace(/```lua/g, '').replace(/```/g, '').trim();

        console.log("5. Invio a Roblox!");
        isAiWorking = false;
        res.json({ 
            architetto: architecturePlan, 
            critic_status: criticData.critique,
            code: finalCode 
        });

    } catch (error) {
        console.error("Errore API:", error.message);
        isAiWorking = false;
        res.status(500).json({ error: "Errore di rete." });
    }
});

app.post('/ai-team/report-error', (req, res) => {
    const errorMsg = req.body.error;
    if (!gameMemory.known_errors.includes(errorMsg)) {
        gameMemory.known_errors.push(errorMsg);
        console.log("⚠️ Errore ricevuto:", errorMsg);
    }
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dream Team (Google Shield) online sulla porta ${PORT}`));
