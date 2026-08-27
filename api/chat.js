export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const { contents, systemInstruction } = req.body;

        // Basic validation
        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({
                error: "Invalid request: contents are required."
            });
        }

        // Check API key
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("GEMINI_API_KEY is missing.");
            return res.status(500).json({
                error: "Gemini API key is not configured on the server."
            });
        }

        // Current Gemini model
        const MODEL = "gemini-2.5-flash";

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify({
                    contents,
                    systemInstruction
                })
            }
        );

        const data = await response.json();

        // Gemini returned an error
        if (!response.ok) {
            console.error("Gemini API Error:", data);

            return res.status(response.status).json({
                error: data?.error?.message || "Gemini API request failed."
            });
        }

        // Return Gemini response to frontend
        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);

        return res.status(500).json({
            error: "Internal server error.",
            message: error.message
        });
    }
}
