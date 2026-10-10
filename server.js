const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// Provider 1: Groq (Meta Llama 3.1 - Stabilissimo)
const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

// Provider 2: Google AI Studio (Gemini 2.0 Flash - Gratuito per sempre)
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
        // 1. Architetto (Google Gemini 2.0 Flash)
        console.log("1. L'Architetto (Gemini 2.0) sta progettando...");
        const archModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const archPrompt = `Sei l'Architetto di un gioco Roblox. Progetta la logica in modo modulare. Non scrivere codice. Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}`;
        const archResult = await archModel.generateContent(archPrompt);
        const architecturePlan = archResult.response.text();

        // 2. Programmatore (Meta Llama 3.1 8B su Groq)
        console.log("2. Il Programmatore (Llama 3.1) sta scrivendo il codice...");
        const coderResponse = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [
                { role: "system", content: "Sei un Senior Luau Developer. Scrivi SOLO codice Luau puro, zero markdown (no ```lua)." },
                { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori passati: ${gameMemory.known_errors.join(', ')}` }
            ]
        });
        let rawCode = coderResponse.choices[0].message.content;

        // 3. Critico (Google Gemini 2.0 Flash)
        console.log("3. Il Critico (Gemini 2.0) sta analizzando il codice...");
        const criticModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
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

        // 4. Ottimizzatore (Meta Llama 3.1 8B su Groq)
        console.log("4. L'Ottimizzatore (Llama 3.1) sta finalizzando...");
        const optimizerResponse = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [
                { role: "system", content: "Sei il Lead Developer. Prendi il codice, correggilo se il Critico ha trovato bug, ottimizzalo per il lag (usa task.wait() invece di wait()), e restituisci SOLO codice Luau puro pronto per Roblox." },
                { role: "user", content: `Critica: ${criticData.critique}. Codice: ${rawCode}` }
            ]
        });
        let finalCode = optimizerResponse.choices[0].message.content;

        // Aggiornamento Memoria
        gameMemory.game_state = `Ultima feature: ${userRequest}. Codice processato dai Dual Titan.`;
        finalCode = finalCode.replace(/```lua/g, '').replace(/```/g, '').trim();

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
app.listen(PORT, () => console.log(`Dream Team Dual Titan (Gemini + Llama) online sulla porta ${PORT}`));
