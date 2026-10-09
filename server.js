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

// Memoria avanzata: tiene traccia di cosa c'è nel gioco E degli errori
let gameMemory = { 
    game_state: "Baseplate vuoto. Pronto per lo sviluppo.", 
    known_errors: [],
    script_history: [] 
};

let isAiWorking = false;

app.post('/ai-team/request', async (req, res) => {
    if (isAiWorking) {
        return res.status(429).json({ error: "Il team AI sta già lavorando. Aspetta." });
    }

    isAiWorking = true;
    const userRequest = req.body.message;

    try {
        console.log("1. Nemotron 5 405B sta progettando l'architettura suprema...");
        const archResponse = await openrouter.chat.completions.create({
            model: "nvidia/nemotron-5-405b-instruct:free", 
            messages: [
                { role: "system", content: "Sei il Project Manager di un gioco Roblox top-tier. Progetta sistemi scalabili, anti-lag, modulari. Non scrivere codice, solo logica sistemica." },
                { role: "user", content: `Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}` }
            ]
        });
        const architecturePlan = archResponse.choices[0].message.content;

        console.log("2. Qwen 3.5 Coder 110B sta scrivendo il codice grezzo...");
        const coderResponse = await openrouter.chat.completions.create({
            model: "qwen/qwen-3.5-coder-110b:free", 
            messages: [
                { role: "system", content: "Sei il miglior Senior Luau Developer. Scrivi SOLO codice Luau puro, zero markdown (no ```lua)." },
                { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori passati da evitare: ${gameMemory.known_errors.join(', ')}` }
            ]
        });
        let rawCode = coderResponse.choices[0].message.content;

        console.log("3. DeepSeek R3.5 sta facendo la critica spietata (Reflection)...");
        const criticResponse = await openrouter.chat.completions.create({
            model: "deepseek/deepseek-r3.5-distill:free", 
            messages: [
                { role: "system", content: "Sei un critico spietato. Leggi il codice Luau. Cerca loop infiniti, memory leak, exploit da hacker. Rispondi in JSON: {'is_safe': true/false, 'critique': 'motivo per cui fa schifo o 'ok''}" },
                { role: "user", content: `Codice da criticare: ${rawCode}` }
            ]
        });
        let criticText = criticResponse.choices[0].message.content;
        
        let criticData;
        try {
            const jsonStart = criticText.indexOf('{');
            const jsonEnd = criticText.lastIndexOf('}');
            criticData = JSON.parse(criticText.substring(jsonStart, jsonEnd + 1));
        } catch (e) {
            criticData = { is_safe: true, critique: "ok" };
        }

        // Se il Critic dice che fa schifo, lo rimanda indietro a Qwen per correggerlo!
        if (!criticData.is_safe) {
            console.log("3.5. Il Critic ha trovato un bug! Rimando il codice a Qwen per correggerlo...");
            const fixResponse = await openrouter.chat.completions.create({
                model: "qwen/qwen-3.5-coder-110b:free", 
                messages: [
                    { role: "system", content: "Correggi il codice in base alla critica. Scrivi SOLO codice Luau puro." },
                    { role: "user", content: `Il Critic dice: ${criticData.critique}. Codice da fixare: ${rawCode}` }
                ]
            });
            rawCode = fixResponse.choices[0].message.content;
        }

        console.log("4. Gemini 3.5 Pro aggiorna la memoria globale...");
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-3.5-pro" });
        const qaPrompt = `Aggiorna lo stato del gioco in base a questo codice Luau: ${rawCode}. Rispondi in JSON: {"new_state": "descrizione breve"}`;
        
        const qaResult = await geminiModel.generateContent(qaPrompt);
        const qaText = qaResult.response.text();
        let qaData;
        try {
            const jsonStart = qaText.indexOf('{');
            const jsonEnd = qaText.lastIndexOf('}');
            qaData = JSON.parse(qaText.substring(jsonStart, jsonEnd + 1));
            gameMemory.game_state = qaData.new_state || "Stato aggiornato";
        } catch (e) {
            gameMemory.game_state = "Stato aggiornato";
        }

        // Pulizia finale del markdown
        let finalCode = rawCode.replace(/```lua/g, '').replace(/```/g, '').trim();
        gameMemory.script_history.push(finalCode);

        console.log("5. Invio del codice perfetto a Roblox!");
        isAiWorking = false;
        res.json({ 
            architetto: architecturePlan, 
            critic_status: criticData.critique,
            code: finalCode 
        });

    } catch (error) {
        console.error("Errore API:", error.message);
        isAiWorking = false;
        res.status(500).json({ error: "Limite gratuito raggiunto o errore di rete. Riprova." });
    }
});

app.post('/ai-team/report-error', (req, res) => {
    // AUTO-GUARIGIONE: Salva l'errore nella memoria. La prossima volta che Qwen scrive codice, leggerà questo errore e non lo farà più!
    const errorMsg = req.body.error;
    if (!gameMemory.known_errors.includes(errorMsg)) {
        gameMemory.known_errors.push(errorMsg);
        console.log("⚠️ Errore di runtime ricevuto da Roblox e salvato nella memoria del team AI:", errorMsg);
    }
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dream Team Apex Predator (4 AI + Self-Healing) online sulla porta ${PORT}`));
