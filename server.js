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

// Variabili globali per i modelli dinamici
let modelArchitetto = null;
let modelCritico = null;

// Funzione che parte all'avvio: cerca i modelli esatti disponibili in questo momento su Groq
async function loadModels() {
    try {
        console.log("Ricerca modelli disponibili su Groq in corso...");
        const response = await groq.models.list();
        const availableModels = response.data.map(m => m.id);
        console.log("Modelli trovati:", availableModels.join(", "));

        // Sceglie automaticamente il modello più grande per l'Architetto/Programmatore
        modelArchitetto = availableModels.find(m => m.includes('70b')) || 
                          availableModels.find(m => m.includes('llama-3.3')) || 
                          availableModels[0];
                          
        // Sceglie un modello diverso per il Critico
        modelCritico = availableModels.find(m => m !== modelArchitetto && m.includes('gemma')) || 
                       availableModels.find(m => m !== modelArchitetto) || 
                       modelArchitetto;

        console.log(`✅ Agente 1 (Architetto/Coder) userà: ${modelArchitetto}`);
        console.log(`✅ Agente 2 (Critico/Lead) userà: ${modelCritico}`);
    } catch (e) {
        console.error("Impossibile caricare i modelli da Groq:", e.message);
    }
}

loadModels(); // Avvia la ricerca

app.post('/ai-team/request', async (req, res) => {
    if (isAiWorking) {
        return res.status(429).json({ error: "Il team AI sta già lavorando. Aspetta." });
    }
    if (!modelArchitetto) {
        return res.status(503).json({ error: "Il server sta ancora caricando i modelli AI. Riprova tra 10 secondi." });
    }

    isAiWorking = true;
    const userRequest = req.body.message;

    try {
        // 1. Architetto (Modello Dinamico 1)
        console.log(`1. L'Architetto (${modelArchitetto}) sta progettando...`);
        const archResponse = await groq.chat.completions.create({
            model: modelArchitetto, 
            messages: [
                { role: "system", content: "Sei l'Architetto di un gioco Roblox. Progetta la logica in modo modulare. Non scrivere codice." },
                { role: "user", content: `Stato: ${gameMemory.game_state}. Richiesta: ${userRequest}` }
            ]
        });
        const architecturePlan = archResponse.choices[0].message.content;

        // 2. Programmatore (Modello Dinamico 1)
        console.log(`2. Il Programmatore (${modelArchitetto}) sta scrivendo il codice...`);
        const coderResponse = await groq.chat.completions.create({
            model: modelArchitetto, 
            messages: [
                { role: "system", content: "Sei un Senior Luau Developer. Scrivi SOLO codice Luau puro, zero markdown (no ```lua)." },
                { role: "user", content: `Architettura: ${architecturePlan}. Genera il codice. Errori passati: ${gameMemory.known_errors.join(', ')}` }
            ]
        });
        let rawCode = coderResponse.choices[0].message.content;

        // 3. Critico (Modello Dinamico 2)
        console.log(`3. Il Critico (${modelCritico}) sta analizzando il codice...`);
        const criticResponse = await groq.chat.completions.create({
            model: modelCritico, 
            messages: [
                { role: "user", content: `Sei un critico spietato. Leggi questo codice Luau: ${rawCode}. Cerca loop infiniti o memory leak. Rispondi in JSON: {"is_safe": true/false, "critique": "motivo o ok"}` }
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

        // 4. Ottimizzatore (Modello Dinamico 2)
        console.log(`4. L'Ottimizzatore (${modelCritico}) sta finalizzando...`);
        const optimizerResponse = await groq.chat.completions.create({
            model: modelCritico, 
            messages: [
                { role: "system", content: "Sei il Lead Developer. Prendi il codice, correggilo se il Critico ha trovato bug, ottimizzalo per il lag (usa task.wait() invece di wait()), e restituisci SOLO codice Luau puro pronto per Roblox." },
                { role: "user", content: `Critica: ${criticData.critique}. Codice: ${rawCode}` }
            ]
        });
        let finalCode = optimizerResponse.choices[0].message.content;

        gameMemory.game_state = `Ultima feature: ${userRequest}. Codice processato.`;
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
app.listen(PORT, () => console.log(`Dream Team Auto-Adattante online sulla porta ${PORT}`));
