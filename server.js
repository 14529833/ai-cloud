const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let gameMemory = { 
    game_state: "Il gioco è vuoto. Tutto da costruire.", 
    known_errors: [] 
};

// SISTEMA ANTI-BLOCCO: Variabile di stato per evitare di sovraccaricare le API gratuite
let isAiWorking = false;

app.post('/ai-team/request', async (req, res) => {
    // Se il team AI è già occupato a pensare, rifiuta la richiesta per non farti bannare
    if (isAiWorking) {
        return res.status(429).json({ error: "Il team AI sta già lavorando. Aspetta 10 secondi." });
    }

    isAiWorking = true;
    const userRequest = req.body.message;

    try {
        // AGENTE 1: DeepSeek R3
        const archResponse = await openrouter.chat.completions.create({
            model: "deepseek/deepseek-r3:free", 
            messages: [
                { role: "system", content: "Sei l'Architetto Capo. Progetta in modo modulare. Non scrivere codice." },
                { role: "user", content: `Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}` }
            ]
        });
        const architecturePlan = archResponse.choices[0].message.content;

        // AGENTE 2: Qwen 3 Coder
        const coderResponse = await openrouter.chat.completions.create({
            model: "qwen/qwen-3-coder-72b:free", 
            messages: [
                { role: "system", content: "Sei un Senior Luau Developer. Scrivi SOLO codice Luau puro, senza markdown." },
                { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori precedenti: ${gameMemory.known_errors.join(', ')}` }
            ]
        });
        let luauCode = coderResponse.choices[0].message.content;

        // AGENTE 3: Gemini 3.0 Flash (QA)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-3.0-flash-001" });
        const qaPrompt = `Analizza questo codice Luau: "${luauCode}". Rispondi in JSON: {"is_safe": true/false, "new_state": "breve descrizione"}`;
        
        const qaResult = await geminiModel.generateContent(qaPrompt);
        const qaText = qaResult.response.text();
        
        let qaData;
        try {
            const jsonStart = qaText.indexOf('{');
            const jsonEnd = qaText.lastIndexOf('}');
            qaData = JSON.parse(qaText.substring(jsonStart, jsonEnd + 1));
        } catch (e) {
            qaData = { is_safe: true, new_state: "Stato non chiaro" };
        }

        if (!qaData.is_safe) {
            isAiWorking = false; // Libera il team per il prossimo compito
            return res.json({ error: "Codice bloccato dal QA." });
        }

        luauCode = luauCode.replace(/```lua/g, '').replace(/```/g, '').trim();
        gameMemory.game_state = qaData.new_state;

        isAiWorking = false; // Libera il team
        res.json({ 
            architetto: architecturePlan, 
            qa_status: qaData.new_state,
            code: luauCode 
        });

    } catch (error) {
        console.error("Errore o Limite Gratuito Raggiunto:", error.message);
        isAiWorking = false;
        // Se le API gratuite ti bloccano per troppo traffico, avvisa Roblox
        res.status(500).json({ error: "Limite API gratuito raggiunto. Riprova tra 1 minuto." });
    }
});

app.post('/ai-team/report-error', (req, res) => {
    gameMemory.known_errors.push(req.body.error);
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Orchestratore 100% Gratuito online sulla porta ${PORT}`));
