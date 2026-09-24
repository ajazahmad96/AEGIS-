// =========================================================
// AEGIS INPUT DETECTION
//
// Validates the request body and works out what kind of input
// arrived: text, image(s), audio. Output is a normalized object
// the rest of the pipeline can trust.
//
// Request body (backward compatible - old clients still work):
//   {
//     contents:  [{ role, parts:[{text}] }],   // required (may be [] for audio)
//     userProfile: {...},
//     images?:   [{ mimeType, data(base64) }], // attached to the latest user message
//     audio?:    { mimeType, data(base64) },   // voice input (transcribed first)
//     voiceReply?: boolean                     // speak the reply (Orpheus)
//   }
// =========================================================

import { InputError } from './errors.js';
import { getModel } from './modelRegistry.js';

export const MAX_MESSAGES = 20;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Whisper-supported containers, keyed by base MIME type.
const AUDIO_EXTENSIONS = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac'
};

const MAX_IMAGE_CHARS = 2_000_000; // base64 chars per image
const MAX_TOTAL_IMAGE_CHARS = 3_600_000; // stay under the ~4.5MB request limit
const MAX_AUDIO_CHARS = 4_000_000;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function baseMime(mime) {
    return String(mime || '').split(';')[0].trim().toLowerCase();
}

function cleanBase64(data) {
    return String(data || '').replace(/\s+/g, '');
}

function normalizeContents(contents) {
    return contents
        .slice(-MAX_MESSAGES)
        .map((msg) => {
            const rawParts = Array.isArray(msg?.parts)
                ? msg.parts
                : [{ text: String(msg?.parts || '') }];

            // Only plain text parts are accepted from the client.
            const parts = rawParts
                .filter((p) => p && typeof p.text === 'string' && p.text.length > 0)
                .map((p) => ({ text: p.text }));

            return {
                role: msg?.role === 'user' ? 'user' : 'model',
                parts
            };
        })
        .filter((msg) => msg.parts.length > 0);
}

function validateImages(images) {
    if (images === undefined || images === null) return [];
    if (!Array.isArray(images)) throw new InputError('Invalid image attachment.');

    const maxImages = getModel('vision').maxImages || 3;
    if (images.length > maxImages) {
        throw new InputError(`You can attach up to ${maxImages} images at a time.`);
    }

    let total = 0;
    return images.map((img) => {
        const mimeType = baseMime(img?.mimeType);
        const data = cleanBase64(img?.data);

        if (!IMAGE_MIME.has(mimeType) || !data || !BASE64_PATTERN.test(data)) {
            throw new InputError('That image format is not supported.');
        }
        total += data.length;
        if (data.length > MAX_IMAGE_CHARS || total > MAX_TOTAL_IMAGE_CHARS) {
            throw new InputError('That image is too large. Please use a smaller image.');
        }
        return { mimeType, data };
    });
}

function validateAudio(audio) {
    if (audio === undefined || audio === null) return null;
    if (typeof audio !== 'object') throw new InputError('Invalid voice recording.');

    const mimeType = baseMime(audio.mimeType);
    const data = cleanBase64(audio.data);
    const extension = AUDIO_EXTENSIONS[mimeType];

    if (!extension || !data || !BASE64_PATTERN.test(data)) {
        throw new InputError('That audio format is not supported.');
    }
    if (data.length > MAX_AUDIO_CHARS) {
        throw new InputError('That recording is too long. Please keep it shorter.');
    }
    return { mimeType, data, extension };
}

export function detectInput(body) {
    const { contents, images, audio, voiceReply } = body || {};

    if (!Array.isArray(contents)) {
        throw new InputError('Invalid request payload.');
    }

    const normalizedAudio = validateAudio(audio);
    const normalizedImages = validateImages(images);
    const normalizedContents = normalizeContents(contents);

    if (normalizedContents.length === 0 && !normalizedAudio) {
        throw new InputError('Invalid request payload.');
    }

    return {
        contents: normalizedContents,
        images: normalizedImages,
        audio: normalizedAudio,
        voiceReply: voiceReply === true,
        hasImages: normalizedImages.length > 0,
        hasAudio: Boolean(normalizedAudio)
    };
}

// Latest user text, used by the router.
export function latestUserText(contents) {
    for (let i = contents.length - 1; i >= 0; i--) {
        if (contents[i].role === 'user') {
            return contents[i].parts.map((p) => p.text).join('\n');
        }
    }
    return '';
}
