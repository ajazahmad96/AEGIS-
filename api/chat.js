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

    // Collecting keys safely from Vercel environment variables
    const keys = [];
    if (process.env.GEMINI_API_KEY_1) keys.push(process.env.GEMINI_API_KEY_1);
    if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
    if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY)) {
        keys.push(process.env.GEMINI_API_KEY);
    }

    if (keys.length === 0) {
        return res.status(500).json({ error: "No API keys found in Vercel environment variables." });
    }

    const { contents } = req.body;
    if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: "Invalid request payload." });
    }

    const systemInstruction = "You are AEGIS, an advanced AI architect and developer assistant. Talk to Mr. Ajaz like a genuine, trustworthy friend who truly wants him to grow. Be warm, supportive, and emotionally aware—but always honest. Help him build full-stack projects, solve code issues, and become an entrepreneur.";

    const geminiPayload = {
        system_instruction: {
            parts: [{ text: systemInstruction }]
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
            // Updated to the new gemini-3.6-flash model as requested by Google API
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
