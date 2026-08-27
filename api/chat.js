export default async function handler(req, res) {
    // CORS headers allow karne ke liye
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

    // Environment variables se API keys lena (Supports GEMINI_API_KEY_1, GEMINI_API_KEY_2 or GEMINI_API_KEY)
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

    // Payload format for Gemini v1beta API
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

    let lastError = null;

    // Failover loop across available API keys
    for (let ki = 0; ki < keys.length; ki++) {
        const apiKey = keys[ki];
        try {
            // Direct REST API call to Google Gemini (No external SDK dependency issues)
            const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(geminiPayload)
            });

            const data = await apiResponse.json();

            if (!apiResponse.ok) {
                throw new Error(data.error?.message || `Gemini API error status: ${apiResponse.status}`);
            }

            // Success response
            return res.status(200).json(data);

        } catch (error) {
            console.warn(`API Key index ${ki} failed. Trying next... Error:`, error.message);
            lastError = error;
        }
    }

    // If all keys fail
    return res.status(429).json({ 
        error: "All available API keys are exhausted or rate-limited.",
        details: lastError ? lastError.message : "Unknown error"
    });
}
