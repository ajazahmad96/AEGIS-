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

    const keys = [];
    let i = 1;
    while (process.env[`GEMINI_API_KEY_${i}`]) {
        keys.push(process.env[`GEMINI_API_KEY_${i}`]);
        i++;
    }
    if (keys.length === 0 && process.env.GEMINI_API_KEY) {
        keys.push(process.env.GEMINI_API_KEY);
    }

    if (keys.length === 0) {
        return res.status(500).json({ error: "Server Configuration Error: No Gemini API keys found in Vercel Environment Variables." });
    }

    const { contents } = req.body;
    if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: "Invalid request payload: 'contents' array is required." });
    }

    const systemInstruction = "You are AEGIS, an advanced AI architect and developer assistant. Talk to Mr. Ajaz like a genuine, trustworthy friend who truly wants him to grow. Be warm, supportive, and emotionally aware—but always honest. Help him build full-stack projects, solve code issues, and become an entrepreneur. Keep responses thoughtful, practical, and precise.";

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

    // Using gemini-1.5-flash as the primary stable model
    for (let ki = 0; ki < keys.length; ki++) {
        const apiKey = keys[ki];
        try {
            const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(geminiPayload)
            });

            const data = await apiResponse.json();

            if (!apiResponse.ok) {
                throw new Error(data.error?.message || `API status: ${apiResponse.status}`);
            }

            return res.status(200).json(data);

        } catch (error) {
            console.error(`Key index ${ki} error:`, error.message);
            lastErrorMsg = error.message;
        }
    }

    return res.status(429).json({ 
        error: "Failed to fetch from Gemini API using provided keys.",
        details: lastErrorMsg 
    });
}
