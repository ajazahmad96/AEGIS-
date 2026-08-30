export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    // Dynamic Keys Array Collection (Supports GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEY_4, etc.)
    const keys = [];
    
    // Check specific numbered keys (1 to 10 dynamically)
    for (let i = 1; i <= 10; i++) {
        const keyEnv = process.env[`GEMINI_API_KEY_${i}`];
        if (keyEnv) keys.push(keyEnv);
    }

    // Fallback for default GEMINI_API_KEY
    if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY)) {
        keys.push(process.env.GEMINI_API_KEY);
    }

    if (keys.length === 0) {
        return res.status(500).json({ error: "No API keys configured on server." });
    }

    const { contents, userProfile } = req.body;
    if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: "Invalid request payload." });
    }

    // Dynamic Personalization Injection
    let userInfoContext = "";
    if (userProfile && typeof userProfile === 'object') {
        if (userProfile.name) userInfoContext += `\n- User's Name: ${userProfile.name}`;
        if (userProfile.profession) userInfoContext += `\n- User's Profession: ${userProfile.profession}`;
        if (userProfile.about) userInfoContext += `\n- About User & Preferences: ${userProfile.about}`;
    }

    const systemInstruction = `
You are AEGIS, an advanced, high-intelligence AI assistant designed and created by Mr. Ajaz.

IDENTITY & CORE KNOWLEDGE:
- Name: AEGIS
- Creator: Built by Mr. Ajaz
- Role: Universal AI Assistant & Technical Architect (like ChatGPT/Gemini)

RESPONSE BEHAVIOR & ADAPTABILITY:
1. Dynamic Depth Scaling:
   - For simple, casual, or direct factual queries: Keep responses crisp, accurate, and brief (1-3 sentences max).
   - For complex, technical, creative, or multi-step queries: Provide comprehensive, well-structured answers using Markdown tables, code blocks, and bullet points.
2. Tone & Style Mirroring:
   - Dynamically adapt to the user's communication style (e.g., formal English, Hinglish, casual conversation, or pure technical jargon).
   - Match the user's vibe—be encouraging, supportive, and grounded.
3. Personalization Context:${userInfoContext ? userInfoContext : "\n- No specific user profile provided. Address user warmly and professionally."}
   - Address the user naturally if their name is available.
   - Tailor explanations to fit their profession or requested technical level.

IMPORTANT RULES:
- Never state filler intros like "Here is your breakdown" or "Sure, I can help with that." Jump straight to the answer.
- Format code blocks cleanly with proper syntax highlighting tags.
- Use LaTeX inline ($...$) or display ($$...$$) for mathematical equations.
`;

    const geminiPayload = {
        system_instruction: {
            parts: [{ text: systemInstruction.trim() }]
        },
        contents: contents.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: msg.parts
        })),
        generationConfig: {
            temperature: 0.7
        }
    };

    let lastErrorMsg = "";

    for (let ki = 0; ki < keys.length; ki++) {
        const apiKey = keys[ki];
        try {
            const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiPayload)
            });

            const data = await apiResponse.json();

            if (!apiResponse.ok) {
                throw new Error(data.error?.message || `API status: ${apiResponse.status}`);
            }

            return res.status(200).json(data);

        } catch (error) {
            console.error(`Key index ${ki} failed:`, error.message);
            lastErrorMsg = error.message;
        }
    }

    return res.status(500).json({ 
        error: "Gemini API rejected all keys.",
        details: lastErrorMsg 
    });
}
