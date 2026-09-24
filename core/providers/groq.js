// =========================================================
// GROQ PROVIDER  (server-side only - key comes from GROQ_API_KEY)
//
// Chat (mainBrain / fastBrain / vision), speech-to-text (ears),
// text-to-speech (voice). Model IDs come from the registry.
//
// Only the final answer text is ever read from a response.
// Any separate "reasoning" field is deliberately ignored.
// =========================================================

import { getModel } from '../modelRegistry.js';
import { ProviderError, classifyHttpError } from '../errors.js';

const BASE_URL = 'https://api.groq.com/openai/v1';
const PROVIDER = 'groq';

const TIMEOUTS = { chat: 30000, stt: 20000, tts: 20000 };

export function isGroqConfigured() {
    return Boolean(process.env.GROQ_API_KEY);
}

async function groqFetch(path, { body, headers = {}, timeoutMs }) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new ProviderError('not_configured', { provider: PROVIDER });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, ...headers },
            body,
            signal: controller.signal
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            throw classifyHttpError(PROVIDER, response.status, errorBody);
        }
        return response;
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

// ---------------------------------------------------------
// Chat
// ---------------------------------------------------------
function toGroqMessages(systemInstruction, contents, images) {
    const messages = [{ role: 'system', content: systemInstruction }];

    for (const msg of contents) {
        const text = (msg.parts || [])
            .map((p) => p?.text)
            .filter((t) => typeof t === 'string' && t)
            .join('\n');
        if (!text) continue;
        messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: text });
    }

    if (images && images.length > 0) {
        const imageParts = images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        }));

        let idx = -1;
        for (let i = messages.length - 1; i >= 1; i--) {
            if (messages[i].role === 'user') {
                idx = i;
                break;
            }
        }

        if (idx === -1) {
            messages.push({
                role: 'user',
                content: [{ type: 'text', text: 'Describe this image.' }, ...imageParts]
            });
        } else {
            messages[idx] = {
                role: 'user',
                content: [{ type: 'text', text: messages[idx].content }, ...imageParts]
            };
        }
    }

    return messages;
}

function cleanReply(text) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<\/?think>/gi, '')
        .trim();
}

export async function groqChat({ role, systemInstruction, contents, images }) {
    const entry = getModel(role);

    const body = {
        model: entry.model,
        messages: toGroqMessages(systemInstruction, contents, images),
        stream: false,
        ...entry.params
    };

    const response = await groqFetch('/chat/completions', {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: TIMEOUTS.chat
    });

    const data = await response.json().catch(() => null);
    const text = cleanReply(data?.choices?.[0]?.message?.content);

    if (!text) {
        throw new ProviderError('empty', {
            provider: PROVIDER,
            detail: `finish_reason=${data?.choices?.[0]?.finish_reason || 'unknown'}`
        });
    }
    return { text };
}

// ---------------------------------------------------------
// Speech -> text (ears)
// ---------------------------------------------------------
export async function groqTranscribe({ audio }) {
    const entry = getModel('ears');

    const form = new FormData();
    const bytes = Buffer.from(audio.data, 'base64');
    form.append('file', new Blob([bytes], { type: audio.mimeType }), `audio.${audio.extension}`);
    form.append('model', entry.model);
    form.append('response_format', entry.params.response_format);
    form.append('temperature', String(entry.params.temperature));

    // No Content-Type header: fetch sets the multipart boundary itself.
    const response = await groqFetch('/audio/transcriptions', {
        body: form,
        timeoutMs: TIMEOUTS.stt
    });

    const data = await response.json().catch(() => null);
    const text = String(data?.text || '').trim();

    if (!text) {
        throw new ProviderError('empty', { provider: PROVIDER, detail: 'Empty transcript' });
    }
    return { text };
}

// ---------------------------------------------------------
// Text -> speech (voice). Input must be <= maxInputChars.
// ---------------------------------------------------------
export async function groqSpeak({ text }) {
    const entry = getModel('voice');

    const response = await groqFetch('/audio/speech', {
        body: JSON.stringify({
            model: entry.model,
            input: text,
            voice: entry.params.voice,
            response_format: entry.params.response_format
        }),
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: TIMEOUTS.tts
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
        throw new ProviderError('empty', { provider: PROVIDER, detail: 'Empty audio' });
    }
    return { base64: buffer.toString('base64'), format: entry.params.response_format };
}
