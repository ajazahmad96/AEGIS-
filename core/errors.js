// =========================================================
// AEGIS ERRORS
//
// ProviderError: what went wrong with an upstream API. The raw
//   upstream message is kept in `.detail` for SERVER LOGS ONLY.
//   It is never placed in `.message` and never sent to clients.
// PipelineError / InputError: carry a clean, user-safe message.
// =========================================================

export class ProviderError extends Error {
    constructor(kind, { status = null, provider = 'unknown', detail = '' } = {}) {
        super(`${provider}:${kind}${status ? ` (${status})` : ''}`);
        this.name = 'ProviderError';
        // rate_limit | unavailable | timeout | network | model_unavailable |
        // auth | not_configured | bad_request | empty | unknown
        this.kind = kind;
        this.status = status;
        this.provider = provider;
        this.detail = String(detail || '').slice(0, 300);
    }
}

export class InputError extends Error {
    constructor(userMessage) {
        super(userMessage);
        this.name = 'InputError';
        this.status = 400;
        this.userMessage = userMessage;
    }
}

export class PipelineError extends Error {
    constructor(userMessage, status = 500) {
        super(userMessage);
        this.name = 'PipelineError';
        this.status = status;
        this.userMessage = userMessage;
    }
}

export function classifyHttpError(provider, status, body) {
    const code = String(body?.error?.code || body?.error?.status || '').toLowerCase();
    const message = String(body?.error?.message || `HTTP ${status}`);

    let kind = 'unknown';

    if (status === 429 || code.includes('rate_limit') || code === 'resource_exhausted') {
        kind = 'rate_limit';
    } else if (status === 401 || status === 403) {
        kind = 'auth';
    } else if (
        status === 404 ||
        code.includes('model_not_found') ||
        code.includes('decommission') ||
        /decommission|deprecat/i.test(message)
    ) {
        kind = 'model_unavailable';
    } else if (status === 400 || status === 413 || status === 422) {
        kind = 'bad_request';
    } else if (status >= 500 || status === 408) {
        kind = 'unavailable';
    }

    return new ProviderError(kind, { status, provider, detail: message });
}

// Short, high-level reason shown in Activity Steps (safe for users).
export function describeFailure(kind) {
    switch (kind) {
        case 'rate_limit':
            return 'The model is rate limited right now.';
        case 'unavailable':
        case 'timeout':
        case 'network':
            return 'The model did not respond in time.';
        case 'model_unavailable':
            return 'The model is currently unavailable.';
        case 'auth':
        case 'not_configured':
            return 'The model is not available.';
        case 'bad_request':
            return 'The model could not process this request.';
        case 'empty':
            return 'The model returned an empty reply.';
        default:
            return 'The model request failed.';
    }
}

export const USER_MESSAGES = Object.freeze({
    rate_limit:
        'AEGIS is handling a lot of requests right now. Please wait a moment and try again.',
    generic:
        'AEGIS could not generate a response right now. Please try again in a moment.',
    notConfigured:
        'AEGIS is not fully set up on the server yet. Please try again later.',
    transcription:
        "I couldn't understand that recording. Please try speaking again.",
    transcriptionUnavailable:
        'Voice input is unavailable right now. Please type your message instead.'
});

// Server-side diagnostics only. Never log user message content or keys.
export function logDiagnostic(event, fields = {}) {
    const safe = {};
    for (const [k, v] of Object.entries(fields)) {
        safe[k] = typeof v === 'string' ? v.slice(0, 300) : v;
    }
    console.error(`[AEGIS] ${event}`, JSON.stringify(safe));
}
