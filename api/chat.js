export default async function handler(req, res) {
    // Only POST requests are allowed
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const body = req.body || {};

        const contents = body.contents;
        const systemInstruction = body.systemInstruction;

        // Validate request
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

        // Gemini streaming endpoint
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
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

        // Gemini returned an error
        if (!response.ok) {
            const errorText = await response.text();

            console.error("Gemini API Error:", errorText);

            return res.status(response.status).json({
                error: errorText || "Gemini API request failed."
            });
        }

        // Make sure Gemini returned a stream
        if (!response.body) {
            return res.status(500).json({
                error: "Gemini did not return a response stream."
            });
        }

        // Tell browser that this is an SSE stream
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        // Read Gemini stream
        const reader = response.body.getReader();

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                // Forward Gemini's stream directly to browser
                res.write(Buffer.from(value));
            }
        } finally {
            reader.releaseLock();
        }

        res.end();

    } catch (error) {
        console.error("AEGIS Streaming Server Error:", error);

        // If headers have not been sent, return JSON error
        if (!res.headersSent) {
            return res.status(500).json({
                error: error?.message || "Internal server error."
            });
        }

        // End an already-started stream
        res.end();
    }
}