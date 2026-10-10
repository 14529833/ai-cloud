const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Inizializza Groq (Sempre gratis e iper-veloce)
const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

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
        // 1. Architetto: DeepSeek R1 Distill 70B (Il Pensatore)
        console.log("1. DeepSeek R1 Distill 70B sta progettando l'architettura...");
        const archResponse = await groq.chat.completions.create({
            model: "deepseek-r1-distill-llama-70b", 
            messages: [
                { role: "system", content: "Sei il Project Manager di un gioco Roblox top-tier. Progetta sistemi scalabili, anti-lag, modulari. Non scrivere codice, solo logica sistemica." },
                { role: "user", content: `Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}` }
            ]
        });
        const architecturePlan = archResponse.choices[0].message.content;

        // 2. Programmatore: Qwen 2.5 Coder 32B (Il Re del Codice)
        console.log("2. Qwen 2.5 Coder 32B sta scrivendo il codice Luau...");
        const coderResponse = await groq.chat.completions.create({
            model: "qwen-2.5-coder-32b-instruct", 
            messages: [
                { role: "system", content: "Sei il miglior Senior Luau Developer. Scrivi SOLO codice Luau puro, zero markdown (no ```lua), pronto per ServerScriptService." },
                { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori passati da evitare: ${gameMemory.known_errors.join(', ')}` }
            ]
        });
        let rawCode = coderResponse.choices[0].message.content;

        // 3. Critico: Llama 3.3 70B (Il QA Spietato)
        console.log("3. Llama 3.3 70B sta criticando il codice (Reflection)...");
        const criticResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", 
            messages: [
                { role: "system", content: "Sei un critico spietato. Leggi il codice Luau. Cerca loop infiniti, memory leak, exploit da hacker. Rispondi in JSON: {'is_safe': true/false, 'critique': 'motivo o ok'}" },
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

        if (!criticData.is_safe) {
            console.log("3.5. Bug trovato! Qwen Coder sta correggendo...");
            const fixResponse = await groq.chat.completions.create({
                model: "qwen-2.5-coder-32b-instruct", 
                messages: [
                    { role: "system", content: "Correggi il codice. Scrivi SOLO codice Luau puro." },
                    { role: "user", content: `Critica: ${criticData.critique}. Codice: ${rawCode}` }
                ]
            });
            rawCode = fixResponse.choices[0].message.content;
        }

        // 4. Memoria gestita da Llama 3.1 8B (Veloce e leggero)
        console.log("4. Aggiornamento memoria...");
        const memResponse = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [
                { role: "system", content: "Aggiorna lo stato del gioco. Rispondi SOLO in JSON: {\"new_state\": \"descrizione breve\"}" },
                { role: "user", content: `Codice appena generato: ${rawCode}` }
            ]
        });
        let memText = memResponse.choices[0].message.content;
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
app.listen(PORT, () => console.log(`Dream Team (Groq Apex: R1 + Qwen) online sulla porta ${PORT}`));
