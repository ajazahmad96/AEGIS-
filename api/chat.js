

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const { contents, systemInstruction } = req.body;

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({
                error: "Invalid request."
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured."
            });
        }

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify({
                    contents: contents,
                    systemInstruction: systemInstruction
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error:", data);

            return res.status(response.status).json({
                error: data?.error?.message || "Gemini API request failed."
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);

        return res.status(500).json({
            error: "Internal server error."
        });
    }
}