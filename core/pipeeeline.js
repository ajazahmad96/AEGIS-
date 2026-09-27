// =========================================================
// AEGIS PIPELINE
//
//   Input detection (done by caller: core/input.js)
//     -> [audio] Whisper (ears) -> text
//     -> Model Router -> role
//     -> Provider: Groq (primary) -> Gemini (fallback)
//     -> [voice reply] Orpheus (voice)
//     -> result + activity events
//
// Every step reports what it ACTUALLY did through `activity`.
// Future features (search, memory, tools...) plug in the same way:
// receive the `activity` log and call activity.emit(...).
// =========================================================

import { ActivityType } from './activity.js';
import { getModel } from './modelRegistry.js';
import { latestUserText } from './input.js';
import { routeRequest } from './router.js';
import { groqChat, groqTranscribe, groqSpeak, isGroqConfigured } from './providers/groq.js';
import { geminiChat, isGeminiConfigured } from './providers/gemini.js';
import {
    PipelineError,
    USER_MESSAGES,
    describeFailure,
    logDiagnostic
} from './errors.js';

// ---------------------------------------------------------
// Voice helpers
// ---------------------------------------------------------
const MAX_TOTAL_AUDIO_CHARS = 3_600_000; // keep response under the ~4.5MB limit

function toSpeechText(markdown) {
    return String(markdown || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/^\s{0,3}#{1,6}\s*/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+[.)]\s+/gm, '')
        .replace(/^\s*\|.*\|\s*$/gm, ' ')
        .replace(/[\[\]*_~>#|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitForSpeech(text, maxChars, maxChunks) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunks = [];
    let current = '';

    const push = () => {
        if (current.trim()) chunks.push(current.trim());
        current = '';
    };

    for (const sentence of sentences) {
        if (sentence.length > maxChars) {
            push();
            let piece = '';
            for (const word of sentence.split(' ')) {
                if ((piece + ' ' + word).trim().length > maxChars) {
                    if (piece) chunks.push(piece.trim());
                    piece = word.slice(0, maxChars);
                } else {
                    piece = (piece + ' ' + word).trim();
                }
            }
            if (piece) chunks.push(piece.trim());
        } else if ((current + ' ' + sentence).trim().length > maxChars) {
            push();
            current = sentence;
        } else {
            current = (current + ' ' + sentence).trim();
        }
    }
    push();

    return { chunks: chunks.slice(0, maxChunks), truncated: chunks.length > maxChunks };
}

async function synthesizeReply(text, activity) {
    const voice = getModel('voice');

    activity.info(
        ActivityType.AUDIO,
        'Preparing voice output',
        'Getting the reply ready to be spoken.'
    );

    const speechText = toSpeechText(text);
    if (!speechText) {
        activity.warning(ActivityType.AUDIO, 'Voice output skipped', 'There was nothing to read aloud.');
        return null;
    }

    const { chunks, truncated } = splitForSpeech(
        speechText,
        voice.params.maxInputChars - 10,
        voice.params.maxChunks
    );

    activity.info(
        ActivityType.AUDIO,
        `Converting text to speech with ${voice.label}`,
        truncated ? 'Reading the first part of the reply aloud.' : 'Turning the reply into audio.'
    );

    const settled = await Promise.allSettled(chunks.map((chunk) => groqSpeak({ text: chunk })));

    const audioChunks = [];
    let totalChars = 0;
    let cut = truncated;

    for (const result of settled) {
        if (result.status !== 'fulfilled') {
            cut = true;
            logDiagnostic('tts_failed', { kind: result.reason?.kind, status: result.reason?.status, detail: result.reason?.detail });
            break; // keep only a contiguous prefix so speech stays in order
        }
        totalChars += result.value.base64.length;
        if (totalChars > MAX_TOTAL_AUDIO_CHARS) {
            cut = true;
            break;
        }
        audioChunks.push(result.value.base64);
    }

    if (audioChunks.length === 0) {
        activity.warning(
            ActivityType.AUDIO,
            'Voice output unavailable',
            'The reply is shown as text instead.'
        );
        return null;
    }

    return { format: voice.params.response_format, chunks: audioChunks, truncated: cut };
}

// ---------------------------------------------------------
// Main entry
// ---------------------------------------------------------
export async function runPipeline({ input, systemInstruction, activity }) {
    let { contents } = input;
    let transcript = null;

    const groqReady = isGroqConfigured();
    const geminiReady = isGeminiConfigured();

    // ---- Voice input: speech -> text -----------------------
    if (input.hasAudio) {
        activity.info(ActivityType.AUDIO, 'Receiving voice input', 'Voice recording received.');

        if (!groqReady) {
            activity.warning(ActivityType.ERROR, 'Unable to generate response', 'Voice input is unavailable.');
            throw new PipelineError(USER_MESSAGES.transcriptionUnavailable, 503);
        }

        const ears = getModel('ears');
        activity.info(
            ActivityType.AUDIO,
            `Transcribing speech with ${ears.label}`,
            'Converting your recording to text.'
        );

        try {
            const { text } = await groqTranscribe({ audio: input.audio });
            transcript = text;
        } catch (err) {
            logDiagnostic('stt_failed', { kind: err.kind, status: err.status, detail: err.detail });
            activity.warning(ActivityType.ERROR, 'Unable to transcribe speech', describeFailure(err.kind));
            throw new PipelineError(
                err.kind === 'empty' ? USER_MESSAGES.transcription : USER_MESSAGES.transcriptionUnavailable,
                err.kind === 'empty' ? 422 : 503
            );
        }

        contents = [...contents, { role: 'user', parts: [{ text: transcript }] }];
    }

    // ---- Understand + route --------------------------------
    if (input.hasImages) {
        activity.info(ActivityType.IMAGE, 'Processing uploaded image', 'Preparing the image for analysis.');
    }
    activity.info(
        ActivityType.REQUEST,
        'Understanding the request',
        input.hasImages ? 'Reading your question about the image.' : 'Reading your message.'
    );

    const userText = latestUserText(contents);
    const route = routeRequest({ text: userText, hasImages: input.hasImages, contents });

    if (route.role === 'mainBrain') {
        activity.info(ActivityType.COMPLEXITY, 'Determining task complexity', route.reason);
    }

    const primary = getModel(route.role);

    // ---- Generate (Groq -> Gemini fallback) ----------------
    const failures = [];
    let reply = null;
    let usedModel = null;

    if (groqReady) {
        activity.info(
            ActivityType.MODEL,
            `Selecting ${primary.label}`,
            route.role === 'vision'
                ? 'Using the vision model for the attached image.'
                : route.role === 'mainBrain'
                    ? `Using ${primary.label} for this complex request.`
                    : `Using ${primary.label} for this quick request.`
        );

        if (route.role === 'vision') {
            activity.info(ActivityType.IMAGE, 'Analyzing visual information', 'Sending the image to the vision model.');
        }
        activity.info(ActivityType.GENERATION, 'Generating response', `Asking ${primary.label} to write the reply.`);

        try {
            const { text } = await groqChat({
                role: route.role,
                systemInstruction,
                contents,
                images: input.images
            });
            reply = text;
            usedModel = { role: route.role, label: primary.label, provider: primary.provider };
        } catch (err) {
            failures.push(err);
            logDiagnostic('primary_failed', {
                role: route.role,
                model: primary.model,
                kind: err.kind,
                status: err.status,
                detail: err.detail
            });
            activity.warning(ActivityType.FALLBACK, 'Primary model unavailable', describeFailure(err.kind));
        }
    } else {
        logDiagnostic('groq_not_configured', { note: 'GROQ_API_KEY is not set; using Gemini only.' });
    }

    if (!reply && geminiReady) {
        const fallback = getModel('fallback');

        if (groqReady) {
            activity.info(ActivityType.FALLBACK, 'Switching to Gemini', 'Using the Gemini fallback model.');
        } else {
            activity.info(ActivityType.MODEL, `Selecting ${fallback.label}`, `Using ${fallback.label} for this request.`);
        }
        activity.info(ActivityType.GENERATION, 'Generating response', `Asking ${fallback.label} to write the reply.`);

        try {
            const { text } = await geminiChat({
                systemInstruction,
                contents,
                images: input.images,
                onKeyFailure: (err, n, total) =>
                    logDiagnostic('gemini_key_failed', {
                        key: `${n}/${total}`,
                        kind: err.kind,
                        status: err.status,
                        detail: err.detail
                    })
            });
            reply = text;
            usedModel = { role: 'fallback', label: fallback.label, provider: fallback.provider };
        } catch (err) {
            failures.push(err);
            activity.warning(ActivityType.FALLBACK, 'Gemini unavailable', describeFailure(err.kind));
        }
    }

    if (!reply) {
        activity.warning(ActivityType.ERROR, 'Unable to generate response', 'No model could answer this request.');

        if (!groqReady && !geminiReady) {
            throw new PipelineError(USER_MESSAGES.notConfigured, 500);
        }
        const rateLimited = failures.some((f) => f.kind === 'rate_limit');
        throw new PipelineError(
            rateLimited ? USER_MESSAGES.rate_limit : USER_MESSAGES.generic,
            rateLimited ? 429 : 500
        );
    }

    // ---- Voice output: text -> speech ----------------------
    let audio = null;
    if (input.voiceReply && groqReady) {
        audio = await synthesizeReply(reply, activity);
    }

    activity.success(ActivityType.COMPLETE, 'Done', '');

    return { text: reply, transcript, audio, model: usedModel };
}
