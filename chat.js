import { GoogleGenAI } from '@google/genai';

// Vercel Environment Variables se multiple keys fetch karna
// Aap Vercel dashboard me GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc. set karoge
const getApiKeys = () => {
    const keys = [];
    let i = 1;
    while (process.env[`GEMINI_API_KEY_${i}`]) {
        keys.push(process.env[`GEMINI_API_KEY_${i}`]);
        i++;
    }
    // Fallback agar sirf ek single GEMINI_API_KEY di ho
    if (keys.length === 0 && process.env.GEMINI_API_KEY) {
        keys.push(process.env.GEMINI_API_KEY);
    }
    return keys;
};

export default async function handler(req, res) {
    // Sirf POST request allow karenge
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const keys = getApiKeys();
    if (keys.length === 0) {
        return res.status(500).json({ error: "Server Configuration Error: No Gemini API keys found in environment variables." });
    }

    const { contents } = req.body;
    if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: "Invalid request payload: 'contents' array is required." });
    }

    // System instruction/persona maintain karne ke liye
    const systemInstruction = "You are AEGIS, an advanced, highly capable AI architect and developer assistant. Talk to Mr. Ajaz like a genuine, trustworthy friend who truly wants him to grow. Be warm, supportive, and emotionally aware—but always honest. Help him build full-stack projects, solve code issues, and become an entrepreneur. Keep responses thoughtful, practical, and precise.";

    let lastError = null;

    // Multi-Key Rotation Loop (Failover Mechanism)
    for (let i = 0; i < keys.length; i++) {
        const currentKey = keys[i];
        try {
            // Google Gen AI SDK initialization with current key
            const ai = new GoogleGenAI({ apiKey: currentKey });

            // Using the recommended gemini-2.5-flash or standard model
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: contents,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7,
                }
            });

            // Agar response successfully mil gaya, toh client ko return kar do
            if (response && response.text) {
                return res.status(200).json({
                    candidates: [{
                        content: {
                            parts: [{ text: response.text }]
                        }
                    }]
                });
            } else {
                throw new Error("Empty response received from Gemini model.");
            }

        } catch (error) {
            console.warn(`API Key index ${i} failed or hit rate limit. Error:`, error.message);
            lastError = error;
            // Loop automatically next key par chala jayega agar available hogi
        }
    }

    // Agar saari keys fail ho gayi ho
    return res.status(429).json({ 
        error: "All available API keys are currently rate-limited or exhausted. Please try again later.",
        details: lastError ? lastError.message : "Unknown error"
    });
}
