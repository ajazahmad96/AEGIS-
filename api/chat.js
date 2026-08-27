export default async function handler(req, res) {
    // Only POST requests are allowed
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        // Read request body safely
        const body = req.body || {};

        const contents = body.contents;
        const systemInstruction = body.systemInstruction;

        // Validate conversation data
        if (!Array.isArray(contents) || contents.length === 0) {
            return res.status(400).json({
                error: "Invalid request: conversation contents are missing."
            });
        }

        // Get Gemini API key from Vercel Environment Variables
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
        // Log the real error in Vercel
        console.error("AEGIS Server Error:", error);

        // Also return the actual error message for debugging
        return res.status(500).json({
            error:
                error?.message ||
                "Internal server error."
        });
    }
}