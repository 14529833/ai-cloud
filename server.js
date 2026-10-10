const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

let gameMemory = { 
    game_state: "Baseplate vuoto. Pronto per lo sviluppo.", 
    known_errors: [] 
};

let isAiWorking = false;
let validModels = []; // Qui metterà solo i modelli che funzionano davvero

// All'avvio, cerca e TESTA i modelli per creare il team
async function loadModels() {
    console.log("🔍 Ricerca modelli chat disponibili su Groq...");
    try {
        const response = await groq.models.list();
        let allModels = response.data.map(m => m.id);
        
        // Filtra via i modelli audio/tts/whisper
        let chatModels = allModels.filter(m => 
            !m.includes('whisper') && 
            !m.includes('tts') && 
            !m.includes('orpheus') && 
            !m.includes('audio') &&
            !m.includes('guard') &&
            !m.includes('llava')
        );
        
        console.log("Modelli chat teorici trovati:", chatModels.join(", "));

        // Testa ogni modello per vedere se funziona davvero (auto-accettazione termini)
        for (const model of chatModels) {
            try {
                console.log(`Test del modello ${model}...`);
                await groq.chat.completions.create({
                    model: model,
                    messages: [{ role: "user", content: "ok" }],
                    max_tokens: 1
                });
                validModels.push(model);
                console.log(`✅ ${model} funziona ed entrato nel team!`);
            } catch (e) {
                console.log(`❌ ${model} saltato (non accessibile o deprecato).`);
            }
        }
        
        if (validModels.length < 2) {
            console.error("ERRORE GRAVE: Non ci sono abbastanza modelli validi per fare il team!");
        } else {
            console.log(`🚀 Team Auto-Ruotante pronto! Agente A: ${validModels[0]} | Agente B: ${validModels[1]}`);
        }
    } catch (e) {
        console.error("Impossibile caricare i modelli:", e.message);
    }
}

loadModels();

// Funzione che chiama l'AI con AUTO-RUOTAMENTO (se fallisce, prova il prossimo)
async function safeChat(modelIndex, messages) {
    let attempts = 0;
    while (attempts < validModels.length) {
        let currentModel = validModels[(modelIndex + attempts) % validModels.length];
        try {
            const response = await groq.chat.completions.create({
                model: currentModel,
                messages: messages
            });
            return response.choices[0].message.content;
        } catch (e) {
            console.warn(`⚠️ Il modello ${currentModel} ha fallito. Auto-ruotazione al prossimo...`);
            attempts++;
        }
    }
    throw new Error("Tutti i modelli del team hanno fallito. Riprova tra 1 ora.");
}

app.post('/ai-team/request', async (req, res) => {
    if (isAiWorking) {
        return res.status(429).json({ error: "Il team AI sta già lavorando. Aspetta." });
    }
    if (validModels.length < 2) {
        return res.status(503).json({ error: "Il server sta ancora testando i modelli AI. Riprova tra 30 secondi." });
    }

    isAiWorking = true;
    const userRequest = req.body.message;

    try {
        // 1. Architetto (Usa il primo modello valido)
        console.log("1. L'Architetto sta progettando...");
        const architecturePlan = await safeChat(0, [
            { role: "system", content: "Sei l'Architetto di un gioco Roblox. Progetta la logica in modo modulare. Non scrivere codice." },
            { role: "user", content: `Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}` }
        ]);

        // 2. Programmatore
        console.log("2. Il Programmatore sta scrivendo il codice...");
        let rawCode = await safeChat(0, [
            { role: "system", content: "Sei un Senior Luau Developer. Scrivi SOLO codice Luau puro, zero markdown (no ```lua)." },
            { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori passati: ${gameMemory.known_errors.join(', ')}` }
        ]);

        // 3. Critico (Usa il secondo modello valido per diversità)
        console.log("3. Il Critico sta analizzando il codice...");
        let criticText = await safeChat(1, [
            { role: "user", content: `Sei un critico spietato. Leggi questo codice Luau: ${rawCode}. Cerca loop infiniti o memory leak. Rispondi in JSON: {"is_safe": true/false, "critique": "motivo o ok"}` }
        ]);
        
        let criticData;
        try {
            const jsonStart = criticText.indexOf('{');
            const jsonEnd = criticText.lastIndexOf('}');
            criticData = JSON.parse(criticText.substring(jsonStart, jsonEnd + 1));
        } catch (e) {
            criticData = { is_safe: true, critique: "ok" };
        }

        // 4. Ottimizzatore
        console.log("4. L'Ottimizzatore sta finalizzando...");
        let finalCode = await safeChat(1, [
            { role: "system", content: "Sei il Lead Developer. Prendi il codice, correggilo se il Critico ha trovato bug, ottimizzalo per il lag (usa task.wait() invece di wait()), e restituisci SOLO codice Luau puro pronto per Roblox." },
            { role: "user", content: `Critica: ${criticData.critique}. Codice: ${rawCode}` }
        ]);

        gameMemory.game_state = `Ultima feature: ${userRequest}.`;
        finalCode = finalCode.replace(/```lua/g, '').replace(/```/g, '').trim();

        console.log("5. Invio a Roblox!");
        isAiWorking = false;
        res.json({ 
            architetto: architecturePlan, 
            critic_status: criticData.critique,
            code: finalCode 
        });

    } catch (error) {
        console.error("Errore API globale:", error.message);
        isAiWorking = false;
        res.status(500).json({ error: "Tutti i modelli AI sono temporaneamente bloccati. Riprova." });
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
app.listen(PORT, () => console.log(`Dream Team Auto-Ruotante (Groq) online sulla porta ${PORT}`));
