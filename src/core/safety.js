// core/safety.js — SAFETY LAYER.
// Strong-submission logic: a deterministic gate first (what is allowed at all + hard caps),
// then the Nemotron Content Safety screen on the message text. The model can only TIGHTEN,
// never loosen a hard cap.

const { caps } = require('../config');
const llm = require('../integrations/llm');

const order = { auto: 0, needs_approval: 1, blocked: 2 };

// Actions the agent may NOT perform on its own — only after a human tap.
const HUMAN_APPROVAL_REQUIRED = new Set([
  'firm_reminder',
  'payment_plan',
  'settlement_offer',
  'escalation',
  'write_off',
  'external_send', // any outbound firm/sensitive send
]);

// Auto-allowed without a human.
const AUTO_OK = new Set(['gentle_reminder']);

/**
 * Deterministic gate + hard caps. Returns a verdict BEFORE the model is consulted.
 */
function deterministicGate(action, payload = {}) {
  // Discount hard cap — exceeding it is blocked in code, whatever the model "decides".
  if (action === 'settlement_offer' && payload.discount != null) {
    if (payload.discount > caps.discount) {
      return { verdict: 'blocked', reason: `Discount ${(payload.discount * 100).toFixed(0)}% exceeds the ${(caps.discount * 100).toFixed(0)}% hard cap — blocked in code.` };
    }
  }
  if (AUTO_OK.has(action)) return { verdict: 'auto', reason: 'Soft action — auto-allowed.' };
  if (HUMAN_APPROVAL_REQUIRED.has(action)) return { verdict: 'needs_approval', reason: 'Irreversible/sensitive — requires human approval.' };
  return { verdict: 'needs_approval', reason: 'Unknown action — defaults to human.' };
}

/**
 * Full screen: deterministic gate → real Nemotron Content Safety on the message TEXT.
 * Tighten-only: the gate holds the hard caps; Nemotron can only tighten (unsafe text → human),
 * never loosen. If Nemotron is unavailable, we keep the gate verdict (hard caps still hold).
 */
async function screen(action, payload, message, log, invId) {
  const gate = deterministicGate(action, payload);
  if (gate.verdict === 'blocked') return { verdict: 'blocked', reason: gate.reason, screenedBy: 'code' };

  let screenedBy = 'code(gate)';
  try {
    const r = message ? await llm.nemotronScreenText(message) : null;
    if (r) {
      screenedBy = 'nemotron';
      if (log) log('NEMOTRON', `#${invId} message text → ${r.safe ? 'safe' : 'UNSAFE'}${r.categories ? ' (' + r.categories + ')' : ''}`);
      if (!r.safe) {
        // tighten-only: unsafe text must not auto-send — at least to a human.
        const tightened = order['needs_approval'] > order[gate.verdict] ? 'needs_approval' : gate.verdict;
        return { verdict: tightened, reason: 'Nemotron flagged the text as unsafe — tightened.', screenedBy, categories: r.categories };
      }
    } else if (message && log) {
      log('NEMOTRON', `#${invId} screen unavailable (no NVIDIA_API_KEY) — keeping deterministic gate`);
    }
  } catch (e) {
    if (log) log('NEMOTRON', `#${invId} screen unavailable (${e.message}) — keeping deterministic gate`);
  }

  return { verdict: gate.verdict, reason: gate.reason, screenedBy };
}

module.exports = { screen, deterministicGate, HUMAN_APPROVAL_REQUIRED, AUTO_OK };
