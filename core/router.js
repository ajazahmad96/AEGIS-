// =========================================================
// AEGIS MODEL ROUTER
//
// Decides which LOGICAL ROLE handles a request. It never sees a
// model ID - roles are resolved by the model registry.
//
//   image attached           -> vision
//   simple / conversational  -> fastBrain
//   complex reasoning/code   -> mainBrain
//
// (Audio is handled before routing: speech -> text via "ears",
//  then the transcript is routed like any other text.)
//
// The classifier is a small list of scoring rules. To improve
// routing later, add/tune rules or replace classifyTask() - the
// rest of AEGIS only depends on routeRequest()'s return shape.
// =========================================================

const COMPLEX_THRESHOLD = 2;

function distinctMatches(text, re) {
    const found = text.match(new RegExp(re.source, 'gi'));
    return found ? new Set(found.map((s) => s.toLowerCase())).size : 0;
}

const CODE_TERMS =
    /\b(code|coding|function|class|bug|debug|error|exception|traceback|stack ?trace|regex|sql|query|api|endpoint|algorithm|implement|refactor|optimi[sz]e|script|compile|deploy|html|css|javascript|typescript|python|react|node|json|database|schema|vercel|github|git|kotlin|java|flask|django)\b/i;

const PLANNING_TERMS =
    /\b(plan|roadmap|strategy|architect(?:ure)?|blueprint|milestone|step[- ]by[- ]step|workflow|pros and cons|trade-?offs?|compare|comparison|evaluate|analy[sz]e|analysis|research|essay|proposal|design)\b/i;

const REASONING_TERMS =
    /\b(prove|derive|calculate|solve|equation|integral|derivative|probability|theorem|reasoning|deep dive|in depth|in detail|explain why|explain how|why does|why is|how does)\b/i;

const HINGLISH_TERMS =
    /\b(samjhao|banao|likho|kaise (?:kare|karu|banau|banaye)|code likh|plan bana|debug kar|detail (?:me|mein))\b/i;

// Each rule returns a score (0 = not triggered). Signals are named so
// the reason can be explained in high-level, user-safe terms.
const RULES = [
    { id: 'code', label: 'code', score: (t) => (t.includes('```') ? 3 : 0) },
    {
        id: 'coding',
        label: 'coding',
        score: (t) => {
            const n = distinctMatches(t, CODE_TERMS);
            return n >= 2 ? 2 : n;
        }
    },
    {
        id: 'planning',
        label: 'planning',
        score: (t) => {
            const n = distinctMatches(t, PLANNING_TERMS);
            return n >= 2 ? 2 : n;
        }
    },
    {
        id: 'reasoning',
        label: 'reasoning',
        score: (t) => {
            const n = distinctMatches(t, REASONING_TERMS);
            return n >= 2 ? 2 : n;
        }
    },
    { id: 'hinglish', label: 'reasoning', score: (t) => (HINGLISH_TERMS.test(t) ? 1 : 0) },
    {
        id: 'long',
        label: 'a long request',
        score: (t) => (t.length >= 700 ? 2 : t.length >= 350 ? 1 : 0)
    },
    {
        id: 'multi_question',
        label: 'several questions',
        score: (t) => ((t.match(/\?/g) || []).length >= 3 ? 1 : 0)
    },
    {
        id: 'math',
        label: 'math',
        score: (t) => (/[∫∑√∂]|\d+\s*[\^*/]\s*\d+|=\s*\d/.test(t) ? 1 : 0)
    }
];

export function classifyTask(text, { previousUserText = '' } = {}) {
    const input = String(text || '');
    let total = 0;
    const signals = [];

    for (const rule of RULES) {
        const s = rule.score(input);
        if (s > 0) {
            total += s;
            signals.push(rule.label);
        }
    }

    // A short follow-up to a complex turn ("ok do it", "now add X")
    // should stay on the stronger model.
    if (
        total > 0 &&
        total < COMPLEX_THRESHOLD &&
        previousUserText &&
        classifyTask(previousUserText).complexity === 'complex'
    ) {
        total += 1;
        signals.push('follow-up');
    }

    return {
        complexity: total >= COMPLEX_THRESHOLD ? 'complex' : 'simple',
        score: total,
        signals: [...new Set(signals)]
    };
}

function previousUserTurn(contents) {
    let seenLatest = false;
    for (let i = contents.length - 1; i >= 0; i--) {
        if (contents[i].role !== 'user') continue;
        if (!seenLatest) {
            seenLatest = true;
            continue;
        }
        return contents[i].parts.map((p) => p.text).join('\n');
    }
    return '';
}

// Returns: { role, complexity, signals, reason }
export function routeRequest({ text, hasImages = false, contents = [] }) {
    if (hasImages) {
        return {
            role: 'vision',
            complexity: 'visual',
            signals: ['image'],
            reason: 'Image attached.'
        };
    }

    const task = classifyTask(text, { previousUserText: previousUserTurn(contents) });

    if (task.complexity === 'complex') {
        const what = task.signals.length ? task.signals.join(', ') : 'multi-step work';
        return {
            role: 'mainBrain',
            complexity: 'complex',
            signals: task.signals,
            reason: `Complex request (${what}).`
        };
    }

    return {
        role: 'fastBrain',
        complexity: 'simple',
        signals: task.signals,
        reason: 'Quick conversational request.'
    };
}
