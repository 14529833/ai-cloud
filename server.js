const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const providers = {};
if (process.env.GROQ_API_KEY) providers.groq = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY, timeout: 15000 });
if (process.env.OPENROUTER_API_KEY) providers.openrouter = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY, timeout: 15000 });
let genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

let gameMemory = {
    game_vision: "Da definire.",
    sprint_backlog: [],
    current_sprint_index: 0,
    known_lessons: [],
    feature_history: [],
    agent_notes: "Nessuna nota.",
    player_bugs: [],
    phase: "PLANNING"
};
let isAiWorking = false;
let modelPool = [];

async function loadAllModels() {
    let pool = [];
    if (providers.groq) { try { const res = await providers.groq.models.list(); res.data.forEach(m => { if (!m.id.includes('whisper') && !m.id.includes('audio')) pool.push({ provider: 'groq', model: m.id }); }); } catch(e){} }
    if (providers.openrouter) { try { const res = await providers.openrouter.models.list(); res.data.forEach(m => { if (m.pricing && parseFloat(m.pricing.prompt) === 0) pool.push({ provider: 'openrouter', model: m.id }); }); } catch(e){} }
    if (genAI) pool.push({ provider: 'google', model: 'gemini-1.5-flash' });
    
    if (pool.length === 0) {
        if (providers.groq) pool.push({ provider: 'groq', model: 'llama-3.1-8b-instant' });
        if (genAI) pool.push({ provider: 'google', model: 'gemini-1.5-flash' });
    }
    pool.sort((a, b) => {
        const score = (item) => { const id = item.model.toLowerCase(); if (id.includes('70b') || id.includes('llama-3.3')) return 1; if (id.includes('deepseek')) return 2; if (id.includes('qwen')) return 3; if (id.includes('llama')) return 5; return 10; };
        return score(a) - score(b);
    });
    modelPool = pool;
    if (modelPool.length > 0) console.log(`✅ HOLY TRINITY 22.0 PRONTA: ${modelPool.length} AI!`);
    else console.error("⚠️ NESSUNA AI TROVATA. Controlla le API Keys su Render!");
}
loadAllModels();
setInterval(() => { if (modelPool.length === 0) loadAllModels(); }, 30000);

async function unifiedChat(messages, role, sizePref = 'any') {
    let preferredPool = modelPool;
    if (sizePref === 'large') {
        preferredPool = modelPool.filter(ai => ai.model.includes('70b') || ai.model.includes('3.3') || ai.model.includes('deepseek'));
        if (preferredPool.length === 0) preferredPool = modelPool;
    } else if (sizePref === 'fast') {
        preferredPool = modelPool.filter(ai => ai.model.includes('8b') || ai.model.includes('instant') || ai.model.includes('flash'));
        if (preferredPool.length === 0) preferredPool = modelPool;
    }
    if (preferredPool.length === 0) throw new Error(`${role}: Pool AI vuoto.`);
    
    let attempts = 0;
    const maxAttempts = Math.min(20, preferredPool.length);
    let currentIndex = Math.floor(Math.random() * preferredPool.length);
    
    while (attempts < maxAttempts) {
        const ai = preferredPool[currentIndex % preferredPool.length];
        try {
            if (ai.provider === 'google') {
                const model = genAI.getGenerativeModel({ model: ai.model });
                const prompt = messages.map(m => `${m.role}: ${m.content}`).join("\n");
                const res = await model.generateContent(prompt);
                return res.response.text();
            } else {
                const client = providers[ai.provider];
                const res = await client.chat.completions.create({ model: ai.model, messages, timeout: 15000 });
                return res.choices[0].message.content;
            }
        } catch (e) { 
            attempts++; 
            currentIndex++;
            if (e.message && (e.message.includes('429') || e.message.includes('Rate limit'))) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }
    throw new Error(`${role} fallito.`);
}

function cleanCode(code) {
    if (!code) return "";
    return code.replace(/```[a-z]*/g, '').replace(/```/g, '').trim();
}

app.post('/ai-team/request', async (req, res) => {
    if (isAiWorking) return res.status(429).json({ error: "In lavorazione." });
    if (modelPool.length === 0) return res.status(503).json({ error: "Boot in corso." });
    isAiWorking = true;

    try {
        if (gameMemory.phase === "PLANNING") {
            gameMemory.agent_notes = "Nessuna nota.";
            
            if (gameMemory.feature_history.length === 0) {
                const trendIdea = await unifiedChat([
                    { role: "system", content: "Trend Analyst. Definisci un genere di gioco Roblox e 1 feature virale. 1 frase." },
                    { role: "user", content: `Storia vuota.` }
                ], "Trend", 'fast');
                gameMemory.game_vision = trendIdea.length > 100 ? trendIdea.substring(0, 100) : trendIdea;
            }

            const bugs = gameMemory.player_bugs.length > 0 ? `Fixa URGENTEMENTE: ${gameMemory.player_bugs.join(', ')}. ` : "";
            const historyStr = gameMemory.feature_history.length > 0 ? `NON ripetere: ${gameMemory.feature_history.join(', ')}. ` : "";
            const backlogStr = await unifiedChat([
                { role: "system", content: `Orchestratore. Crea 5 task JSON per un gioco ${gameMemory.game_vision}. ${historyStr}${bugs} Formato: {"tasks": ["t1", "t2"]}.` },
                { role: "user", content: `Genera la roadmap.` }
            ], "Arch", 'large');
            
            try {
                const jsonStart = backlogStr.indexOf('{');
                const jsonEnd = backlogStr.lastIndexOf('}');
                const parsed = JSON.parse(backlogStr.substring(jsonStart, jsonEnd + 1));
                if (!parsed.tasks || parsed.tasks.length === 0) throw new Error("Vuoto");
                gameMemory.sprint_backlog = parsed.tasks;
                gameMemory.current_sprint_index = 0;
                gameMemory.player_bugs = [];
            } catch(e) {
                gameMemory.sprint_backlog = ["Crea una feature interattiva.", "Aggiungi punteggio.", "Aggiungi effetto visivo."];
                gameMemory.current_sprint_index = 0;
                gameMemory.player_bugs = [];
            }
            gameMemory.phase = "EXECUTION";
        }

        if (gameMemory.phase === "MODERATION") {
            const cleanupCode = await unifiedChat([
                { role: "system", content: "Map Moderator. Scrivi codice Luau per eliminare TUTTI gli Instance nella Workspace che hanno l'attributo 'AI_Gen'. Restituisci SOLO codice." },
                { role: "user", content: "Pulisci." }
            ], "Moderator", 'fast');
            
            let finalCode = cleanCode(cleanupCode);
            gameMemory.phase = "PLANNING";
            if (finalCode.length > 10) {
                res.json({ idea: "Pulizia Sicura Mappa", code: finalCode });
                isAiWorking = false;
                return;
            }
        }

        if (gameMemory.phase === "EXECUTION") {
            const currentTask = gameMemory.sprint_backlog[gameMemory.current_sprint_index];

            if (!currentTask || currentTask.length < 3) {
                gameMemory.current_sprint_index++;
                if (gameMemory.current_sprint_index >= gameMemory.sprint_backlog.length) {
                    gameMemory.phase = "MODERATION";
                }
                res.json({ idea: "Task vuoto saltato", code: "-- skip" });
                isAiWorking = false;
                console.log("⏭️ Task vuoto saltato.");
                return;
            }

            let rawCode = await unifiedChat([
                { role: "system", content: `Luau Dev. Regole: 1. task.wait non wait. 2. No require. 3. Max 50 righe. 4. Tagga Instance con SetAttribute(inst, 'AI_Gen', true). 5. I loop DEVONO essere finiti (for i=1, 1000 do task.wait(0.1) end). Controlla SEMPRE if not inst.Parent then break end. VIETATO while true do. Nota: "${gameMemory.agent_notes}". Scrivi SOLO codice.` },
                { role: "user", content: `Task: ${currentTask}. Lezioni: ${gameMemory.known_lessons.slice(-3).join(', ')}` }
            ], "Coder", 'large');

            let finalCode = await unifiedChat([
                { role: "system", content: "Cybersecurity e QA. Correggi il codice. SOSTITUISCI while true do ESATTAMENTE con for i=1, 1000 do task.wait(0.1) end. SOSTITUISCI require con nil. Fixa bug. NON RIFIUTARE MAI. Scrivi la nota in questo formato ESATTO in cima: --[NOTE: nota breve]. Restituisci SOLO codice." },
                { role: "user", content: `Codice:\n${rawCode}` }
            ], "Cyber", 'large');
            finalCode = cleanCode(finalCode);
            
            const noteMatch = finalCode.match(/--\[NOTE: (.*?)\]/);
            if (noteMatch) gameMemory.agent_notes = noteMatch[1].substring(0, 150);

            if (!finalCode || finalCode.length < 10) throw new Error("Codice vuoto.");

            finalCode = await unifiedChat([
                { role: "system", content: "Player Relations. Aggiungi un evento. Restituisci SOLO codice." },
                { role: "user", content: `Codice: ${finalCode}` }
            ], "LiveOps", 'fast');
            finalCode = cleanCode(finalCode);

            gameMemory.current_sprint_index++;
            if (currentTask && currentTask.length > 3 && !gameMemory.feature_history.includes(currentTask)) {
                gameMemory.feature_history.push(currentTask);
                if (gameMemory.feature_history.length > 5) gameMemory.feature_history.shift();
            }

            if (gameMemory.current_sprint_index >= gameMemory.sprint_backlog.length) {
                gameMemory.phase = "MODERATION";
            }

            res.json({ idea: currentTask, code: finalCode });
            isAiWorking = false;
        }

    } catch (error) {
        console.error("💥 Errore:", error.message);
        if (gameMemory.phase === "EXECUTION" && gameMemory.sprint_backlog.length > 0) {
            gameMemory.current_sprint_index++;
            if (gameMemory.current_sprint_index >= gameMemory.sprint_backlog.length) {
                gameMemory.phase = "MODERATION";
            }
            console.log("⏭️ Task saltato per errore AI. Proseguo.");
        }
        isAiWorking = false;
        res.status(500).json({ error: error.message });
    }
});

app.post('/ai-team/player-bug', (req, res) => {
    const bug = req.body.bug;
    if (bug && bug.length > 3 && gameMemory.player_bugs.length < 5) {
        gameMemory.player_bugs.push(bug);
        const lowerBug = bug.toLowerCase();
        if (lowerBug.includes('crash') || lowerBug.includes('broken') || lowerBug.includes('rotto') || lowerBug.includes('lag')) {
            console.log("🚨 BUG CRITICO RICEVUTO! Interruzione sprint per fix immediato.");
            gameMemory.sprint_backlog = [];
            gameMemory.current_sprint_index = 0;
            gameMemory.phase = "PLANNING";
        }
    }
    res.json({ status: "ok" });
});

app.post('/ai-team/report-error', (req, res) => {
    res.json({ status: "ok" });
    analyzeErrorInBackground(req.body.error, req.body.code).catch(e => console.error("BG Debug Fail:", e.message));
});

async function analyzeErrorInBackground(errorMsg, failedCode) {
    const analysis = await unifiedChat([
        { role: "system", content: "Debug Analyst. Spiega in 1 frase PERCHE' questo codice Luau ha dato questo errore." },
        { role: "user", content: `Errore: ${errorMsg}\nCodice:\n${failedCode ? failedCode.substring(0, 1500) : 'N/A'}` }
    ], "Debug", 'fast');
    gameMemory.known_lessons.push(analysis.substring(0, 200));
    if (gameMemory.known_lessons.length > 5) gameMemory.known_lessons.shift();
    console.log("🧠 LEZIONE:", analysis.substring(0, 100));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Holy Trinity 22.0 online sulla porta ${PORT}`));
