// =========================================================
// AEGIS ACTIVITY EVENTS
//
// Activity Steps are built ONLY from things the AEGIS system
// actually did (routing, model calls, fallbacks, tools...).
// They are never written by an AI model, and never contain
// model reasoning / chain-of-thought.
//
// Any backend module can emit an event:
//     activity.emit({ type: 'search', title: 'Searching the web',
//                     description: 'Looking up recent results.' });
//
// The frontend renders the list generically, so new event
// types need no UI changes.
//
// Event shape:
//   { id, type, title, description, status, t }
//   status: info | success | warning | error
//   t: milliseconds since the request started
// =========================================================

export const ActivityType = Object.freeze({
    REQUEST: 'request',
    COMPLEXITY: 'complexity',
    MODEL: 'model',
    GENERATION: 'generation',
    SEARCH: 'search',
    MEMORY: 'memory',
    FILE: 'file',
    IMAGE: 'image',
    AUDIO: 'audio',
    TOOL: 'tool',
    FALLBACK: 'fallback',
    CODE: 'code',
    CALENDAR: 'calendar',
    NOTIFICATION: 'notification',
    AUTOMATION: 'automation',
    COMPLETE: 'complete',
    ERROR: 'error'
});

export const ActivityStatus = Object.freeze({
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error'
});

const VALID_STATUS = new Set(Object.values(ActivityStatus));
const TYPE_PATTERN = /^[a-z][a-z_]{0,23}$/;
const MAX_EVENTS = 40;

export class ActivityLog {
    // onEmit is optional: a future streaming transport (SSE) can
    // forward events live without changing any emitter.
    constructor({ onEmit } = {}) {
        this.events = [];
        this.startedAt = Date.now();
        this.onEmit = typeof onEmit === 'function' ? onEmit : null;
    }

    emit({ type = 'tool', title, description = '', status = ActivityStatus.INFO } = {}) {
        if (!title || this.events.length >= MAX_EVENTS) return null;

        const event = {
            id: this.events.length + 1,
            type: TYPE_PATTERN.test(String(type)) ? String(type) : 'tool',
            title: String(title).slice(0, 80),
            description: String(description || '').slice(0, 200),
            status: VALID_STATUS.has(status) ? status : ActivityStatus.INFO,
            t: Date.now() - this.startedAt
        };

        this.events.push(event);

        if (this.onEmit) {
            try {
                this.onEmit(event);
            } catch (_) {
                // Activity reporting must never break a request.
            }
        }
        return event;
    }

    info(type, title, description) {
        return this.emit({ type, title, description, status: ActivityStatus.INFO });
    }

    success(type, title, description) {
        return this.emit({ type, title, description, status: ActivityStatus.SUCCESS });
    }

    warning(type, title, description) {
        return this.emit({ type, title, description, status: ActivityStatus.WARNING });
    }

    error(type, title, description) {
        return this.emit({ type, title, description, status: ActivityStatus.ERROR });
    }

    toJSON() {
        return this.events.slice();
    }
}
