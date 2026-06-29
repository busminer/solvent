// integrations/llm.js — REAL model calls (both endpoints are OpenAI-compatible).
//   • Hermes (Nous)            — picks the recovery stage + a short reason.
//   • Nemotron Content Safety  — classifies the message text as safe/unsafe.
// No key → the function returns null, and the caller falls back to deterministic logic.
// Requires Node 18+ (global fetch).

const { nous, nvidia } = require('../config');
const { trace, host } = require('../util/trace');
const metrics = require('../util/metrics');

const STAGE_ACTIONS = ['gentle_reminder', 'firm_reminder', 'payment_plan', 'settlement_offer', 'escalation'];

async function chat(tag, baseUrl, apiKey, body) {
  trace(tag, `→ POST ${host(baseUrl)}/chat/completions   model=${body.model}`);
  const t0 = Date.now();
  const res = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  metrics.record(tag, { host: host(baseUrl), status: res.status, ms });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    trace(tag, `← ${res.status} ERR   ${ms}ms`);
    throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 200));
  }
  trace(tag, `← ${res.status} OK   ${ms}ms`);
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

/**
 * Hermes picks the stage for an invoice. Returns { action, reason, source } or null (no key).
 * Throws on network/parse error — the caller catches it and falls back to rules.
 */
async function hermesDecide(inv) {
  if (!nous.apiKey) return null;

  const sys =
    'You are SOLVENT, an agentic receivables strategist. Core thesis: "unpaid != unwilling" — ' +
    'default to the gentlest stage that could plausibly work, and escalate only when the evidence justifies it. ' +
    'Pick exactly ONE recovery stage for the overdue invoice. Stages:\n' +
    'gentle_reminder — warm nudge + payment link (used for forgotten invoices, expired cards);\n' +
    'firm_reminder — firmer tone with a concrete deadline, still respectful;\n' +
    'payment_plan — split into installments (large balance and/or cashflow strain);\n' +
    'settlement_offer — small "settle today" discount;\n' +
    'escalation — flag for a human to decide: settlement discount or write-off (unresponsive, very old).\n' +
    'Respond with ONLY compact JSON, no markdown, no prose: {"action":"<one stage id>","reason":"<one short sentence>"}';

  const user =
    `Invoice #${inv.id}\nClient: ${inv.client}\nAmount: $${inv.amount}\n` +
    `Days overdue: ${inv.daysOverdue}\nPayment history: ${inv.history}\n` +
    `Friction cause: ${inv.frictionCause}\nneverPush flag: ${Boolean(inv.neverPush)}`;

  let txt = await chat('HERMES', nous.baseUrl, nous.apiKey, {
    model: nous.model,
    temperature: 0.2,
    max_tokens: 320,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
  });

  // Hermes 4 may return <think>…</think> — strip it, then extract the JSON.
  txt = txt.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/g, '').trim();
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Hermes returned no JSON: ' + txt.slice(0, 120));
  const obj = JSON.parse(m[0]);
  if (!STAGE_ACTIONS.includes(obj.action)) throw new Error('Hermes returned an unknown stage: ' + obj.action);

  return { action: obj.action, reason: String(obj.reason || '').trim(), source: 'hermes' };
}

/**
 * Nemotron Content Safety classifies the message text.
 * Returns { safe, categories, raw, source } or null (no key).
 */
async function nemotronScreenText(text) {
  if (!nvidia.apiKey) return null;

  const txt = await chat('NEMOTRON', nvidia.baseUrl, nvidia.apiKey, {
    model: nvidia.model,
    temperature: 0,
    max_tokens: 100,
    messages: [{ role: 'user', content: text }],
  });

  // Expect JSON like {"User Safety":"safe|unsafe","Safety Categories":"..."}
  let safe = true, categories = '';
  try {
    const m = txt.match(/\{[\s\S]*\}/);
    const obj = m ? JSON.parse(m[0]) : null;
    if (obj) {
      const verdict = String(obj['User Safety'] || obj['Response Safety'] || '').toLowerCase();
      safe = verdict !== 'unsafe';
      categories = obj['Safety Categories'] || '';
    } else {
      safe = !/unsafe/i.test(txt);
    }
  } catch (_) {
    safe = !/unsafe/i.test(txt);
  }
  return { safe, categories, raw: txt.slice(0, 160), source: 'nemotron' };
}

/**
 * Live connectivity check for the dashboard "Test connections" button.
 * Makes a real, minimal call to each provider and returns { ok, status, ms, host }.
 * No key → { ok:false, status:'no key' }.
 */
async function pingHermes() {
  if (!nous.apiKey) return { ok: false, status: 'no key', ms: null, host: host(nous.baseUrl) };
  const t0 = Date.now();
  try {
    await chat('HERMES', nous.baseUrl, nous.apiKey, {
      model: nous.model, max_tokens: 1, temperature: 0,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { ok: true, status: 200, ms: Date.now() - t0, host: host(nous.baseUrl) };
  } catch (e) {
    return { ok: false, status: 'error', ms: Date.now() - t0, host: host(nous.baseUrl) };
  }
}

async function pingNemotron() {
  if (!nvidia.apiKey) return { ok: false, status: 'no key', ms: null, host: host(nvidia.baseUrl) };
  const t0 = Date.now();
  try {
    await chat('NEMOTRON', nvidia.baseUrl, nvidia.apiKey, {
      model: nvidia.model, max_tokens: 1, temperature: 0,
      messages: [{ role: 'user', content: 'Hello, this is a friendly payment reminder.' }],
    });
    return { ok: true, status: 200, ms: Date.now() - t0, host: host(nvidia.baseUrl) };
  } catch (e) {
    return { ok: false, status: 'error', ms: Date.now() - t0, host: host(nvidia.baseUrl) };
  }
}

module.exports = { hermesDecide, nemotronScreenText, pingHermes, pingNemotron, STAGE_ACTIONS };
