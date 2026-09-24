// =========================================================
// GEMINI PROVIDER  (secondary / fallback)
//
// This is the existing AEGIS Gemini integration, moved out of
// api/chat.js unchanged in behavior:
//   - same key list (GEMINI_API_KEY_1..4, GEMINI_API_KEY)
//   - same key rotation on any failure
//   - same payload shape (system_instruction, contents, temperature)
// The API key is sent in a header, so it never appears in a URL
// (and therefore never in logs).
// =========================================================

import { getModel } from '../modelRegistry.js';
import { ProviderError, classifyHttpError } from '../errors.js';

const PROVIDER = 'gemini';
const TIMEOUT_MS = 30000;

function getKeys() {
    const keys = [];
    const possibleKeys = [
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY
    ];

    for (const key of possibleKeys) {
        if (key && !keys.includes(key)) {
            keys.push(key);
        }
    }
    return keys;
}

export function isGeminiConfigured() {
    return getKeys().length > 0;
}

function withImages(contents, images) {
    if (!images || images.length === 0) return contents;

    const out = contents.map((m) => ({ ...m, parts: [...m.parts] }));
    const imageParts = images.map((img) => ({
        inline_data: { mime_type: img.mimeType, data: img.data }
    }));

    let idx = out.length - 1;
    while (idx >= 0 && out[idx].role !== 'user') idx--;

    if (idx === -1) {
        out.push({ role: 'user', parts: [{ text: 'Describe this image.' }, ...imageParts] });
    } else {
        out[idx].parts.push(...imageParts);
    }
    return out;
}

function extractText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts
        .filter((p) => typeof p?.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim();
}

async function callGemini(apiKey, model, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw classifyHttpError(PROVIDER, response.status, data);
        }
        return data;
    } catch (err) {
        if (err instanceof ProviderError) throw err;
        if (err?.name === 'AbortError') {
            throw new ProviderError('timeout', { provider: PROVIDER, detail: 'Request timed out' });
        }
        throw new ProviderError('network', { provider: PROVIDER, detail: err?.message });
    } finally {
        clearTimeout(timer);
    }
}

export async function geminiChat({ systemInstruction, contents, images, onKeyFailure }) {
    const keys = getKeys();
    if (keys.length === 0) {
        throw new ProviderError('not_configured', { provider: PROVIDER });
    }

    const entry = getModel('fallback');

    const payload = {
        system_instruction: { parts: [{ text: systemInstruction.trim() }] },
        contents: withImages(contents, images),
        generationConfig: { temperature: entry.params.temperature }
    };

    let lastError = null;

    // Key rotation: try each configured key until one succeeds.
    for (let ki = 0; ki < keys.length; ki++) {
        try {
            const data = await callGemini(keys[ki], entry.model, payload);
            const text = extractText(data);

            if (!text) {
                // Blocked/empty reply: another key will not change that.
                throw new ProviderError('empty', {
                    provider: PROVIDER,
                    detail: `finishReason=${data?.candidates?.[0]?.finishReason || 'none'}`
                });
            }
            return { text };
        } catch (err) {
            lastError = err;
            if (typeof onKeyFailure === 'function') {
                onKeyFailure(err, ki + 1, keys.length);
            }
            if (err.kind === 'empty') break;
        }
    }

    throw lastError;
}
