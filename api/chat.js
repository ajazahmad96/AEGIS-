

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        // Read request body
        const body = req.body || {};

        const contents = body.contents;
        const systemInstruction = body.systemInstruction;

        // Validate conversation
        if (!Array.isArray(contents) || contents.length === 0) {
            return res.status(400).json({
                error: "Invalid request: conversation contents are missing."
            });
        }

        // Get API key from Vercel Environment Variables
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("GEMINI_API_KEY is missing.");

            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured in Vercel."
            });
        }

        // Gemini model
        const MODEL = "gemini-3.7-flash";

        // Send request to Gemini
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
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

        // Read Gemini response
        const data = await response.json();

        // Gemini returned an error
        if (!response.ok) {
            console.error("Gemini API Error:", data);

            return res.status(response.status).json({
                error:
                    data?.error?.message ||
                    "Gemini API request failed."
            });
        }

        // Successful response
        return res.status(200).json(data);

    } catch (error) {
        console.error("AEGIS Server Error:", error);

        return res.status(500).json({
            error:
                error?.message ||
                "Internal server error."
        });
    }
}