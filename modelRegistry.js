// =========================================================
// AEGIS MODEL REGISTRY
//
// The ONLY place where concrete model IDs live.
// The rest of AEGIS refers to logical roles:
//   mainBrain | fastBrain | vision | ears | voice | fallback
//
// If a model is renamed or deprecated, change it here only.
// =========================================================

export const PROVIDERS = Object.freeze({
    GROQ: 'groq',
    GEMINI: 'gemini'
});

export const MODEL_REGISTRY = Object.freeze({
    // Complex reasoning, coding, planning
    mainBrain: {
        provider: PROVIDERS.GROQ,
        model: 'openai/gpt-oss-120b',
        label: 'GPT-OSS 120B',
        purpose: 'Complex reasoning, coding, planning',
        params: {
            reasoning_effort: 'medium',
            temperature: 0.7,
            max_completion_tokens: 8192
        }
    },

    // Normal conversation, simple/quick tasks
    fastBrain: {
        provider: PROVIDERS.GROQ,
        model: 'openai/gpt-oss-20b',
        label: 'GPT-OSS 20B',
        purpose: 'Normal conversation, simple and quick tasks',
        params: {
            reasoning_effort: 'low',
            temperature: 0.7,
            max_completion_tokens: 4096
        }
    },

    // Images, screenshots, diagrams
    vision: {
        provider: PROVIDERS.GROQ,
        model: 'qwen/qwen3.8-27b',
        label: 'Qwen 3.8 27B',
        purpose: 'Images, screenshots, diagrams, visual analysis',
        maxImages: 3,
        params: {
            // "none" = instruct mode (no thinking output)
            reasoning_effort: 'none',
            temperature: 0.7,
            max_completion_tokens: 4096
        }
    },

    // Speech -> text
    ears: {
        provider: PROVIDERS.GROQ,
        model: 'whisper-large-v3-turbo',
        label: 'Whisper',
        purpose: 'Speech to text',
        params: {
            response_format: 'json',
            temperature: 0
        }
    },

    // Text -> speech
    voice: {
        provider: PROVIDERS.GROQ,
        model: 'canopylabs/orpheus-v1-english',
        label: 'Orpheus',
        purpose: 'Text to speech',
        params: {
            voice: 'hannah', // autumn, diana, hannah, austin, daniel, troy
            response_format: 'wav',
            maxInputChars: 200, // Orpheus limit per request
            maxChunks: 3 // how many chunks of a reply get spoken
        }
    },

    // Secondary provider used when a Groq request fails
    fallback: {
        provider: PROVIDERS.GEMINI,
        model: 'gemini-3.6-flash',
        label: 'Gemini',
        purpose: 'Fallback when the primary provider fails',
        params: {
            temperature: 0.7
        }
    }
});

export function getModel(role) {
    const entry = MODEL_REGISTRY[role];
    if (!entry) {
        throw new Error(`Unknown model role: ${role}`);
    }
    return entry;
}
