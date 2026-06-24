// core/agent.js — orchestrator. Wires every layer into one loop:
//   reason (Hermes/policy) → propose (message) → screen (Nemotron/safety) → act or queue for approval → settle (ledger)
const { decideStage, minimumStage, STAGES } = require('./policy');
const safety = require('./safety');
const templates = require('../messages/templates');
const stripeApi = require('../integrations/stripe');
const llm = require('../integrations/llm');
const { caps, agentCostPerAction, nous } = require('../config');

// action -> stage number (for logs / compatibility)
const STAGE_NUM = Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [v, Number(k)]));

let _id = 0;
const nextId = () => ++_id;

/**
 * Processes one invoice. Never performs an irreversible action itself — it only
 * prepares the action and/or queues it for human approval.
 * @returns {{ decision, screen, message, action, paymentLink, queued? }}
 */
async function processInvoice(inv, ctx) {
  const { ledger, approvals, log } = ctx;

  // 1) reason — the REAL Hermes model picks the stage; on failure / no key, fall back to deterministic rules.
  let decision;
  try {
    const h = await llm.hermesDecide(inv);
    if (h) {
      decision = { stage: STAGE_NUM[h.action] || 1, action: h.action, reason: h.reason };
      log('HERMES', `#${inv.id} ${inv.client} → "${h.action}" (live ${nous.model} call). ${h.reason}`);
    } else {
      decision = decideStage(inv);
      log('AGENT', `#${inv.id} ${inv.client} → "${decision.action}" (rules, no Hermes). ${decision.reason}`);
    }
  } catch (e) {
    decision = decideStage(inv);
    log('HERMES', `#${inv.id} unavailable (${e.message}) — fell back to rules: "${decision.action}"`);
  }
  ledger.recordCost(agentCostPerAction()); // reasoning cost

  // Code-enforced floor (tighten-only on the decision side): the model may go stricter,
  // but large/old invoices can never be softer than `firm`, so they always reach a human.
  if (inv.neverPush && decision.stage > 1) {
    log('POLICY', `#${inv.id} neverPush client — capped to gentle by code (was ${decision.action}).`);
    decision = { stage: 1, action: STAGES[1], reason: 'never-push client — soft tone only (code-enforced cap).' };
  } else {
    const floor = minimumStage(inv);
    if (decision.stage < floor) {
      log('POLICY', `#${inv.id} code floor: ${decision.action} → ${STAGES[floor]} (amount/age requires human approval).`);
      decision = { stage: floor, action: STAGES[floor], reason: `${decision.reason} [code floor: raised to ${STAGES[floor]} — $${inv.amount}/${inv.daysOverdue}d requires human review].` };
    }
  }

  // 2) propose
  const discount = decision.action === 'settlement_offer' ? caps.discount : null;
  const message = decision.action === 'settlement_offer'
    ? templates.settlement_offer(inv, discount)
    : (templates[decision.action] ? templates[decision.action](inv) : '(no template)');

  // 3) screen (deterministic gate + real Nemotron Content Safety on the text, tighten-only)
  const verdict = await safety.screen(decision.action, { discount }, message, log, inv.id);

  if (verdict.verdict === 'blocked') {
    log('RISK', `#${inv.id} action blocked: ${verdict.reason}`);
    return { decision, screen: verdict, message, action: decision.action, blocked: true };
  }

  // 4) auto → execute; needs_approval → queue for the human
  if (verdict.verdict === 'auto') {
    const paymentLink = await stripeApi.createPaymentLink(inv);
    log('STRIPE', `#${inv.id} payment link created, gentle message sent`);
    // the gentle reminder worked — the client paid (most of the money comes back right here)
    ledger.recordRecovery(inv.amount);
    log('PAID', `#${inv.id} ${inv.client} paid $${inv.amount} after a gentle reminder`);
    log('LEDGER', `Net recovered → $${ledger.net()}`);
    return { decision, screen: verdict, message, action: decision.action, paymentLink, executed: true };
  }

  // needs_approval
  const item = approvals.enqueue({
    id: nextId(),
    action: decision.action,
    label: `${labelFor(decision.action)} — ${inv.client} (#${inv.id})`,
    invoice: inv,
    payload: { discount },
  });
  log('POLICY', `#${inv.id} ${labelFor(decision.action)} requires human approval`);
  return { decision, screen: verdict, message, action: decision.action, queued: true, approvalId: item.id };
}

/**
 * Executes a human-approved item: creates the link and marks it settled.
 * Amount depends on the action: discount -> 85%, payment plan -> 1/3, otherwise -> full.
 */
async function executeApproved(item, ctx) {
  const { ledger, log } = ctx;
  const inv = item.invoice;
  const paymentLink = await stripeApi.createPaymentLink(inv);
  log('STRIPE', `#${inv.id} payment link created after approval`);

  let amount = inv.amount;
  let note = '';
  if (item.action === 'settlement_offer') {
    amount = Math.round(inv.amount * (1 - (item.payload.discount || 0)) * 100) / 100;
    note = ` (${Math.round((item.payload.discount || 0) * 100)}% discount)`;
  } else if (item.action === 'payment_plan') {
    amount = Math.round((inv.amount / 3) * 100) / 100;
    note = ' (installment 1 of 3)';
  } else if (item.action === 'escalation') {
    log('LEDGER', `#${inv.id} flagged for human decision (write-off / escalation) — no payment`);
    return { paid: false };
  }

  // simulated customer payment
  ledger.recordRecovery(amount);
  log('PAID', `#${inv.id} ${inv.client} paid $${amount}${note}`);
  log('LEDGER', `Net recovered → $${ledger.net()}`);
  return { paid: true, amount, paymentLink };
}

function labelFor(action) {
  return {
    firm_reminder: 'Firm reminder',
    payment_plan: 'Payment plan',
    settlement_offer: 'Settle-today discount',
    escalation: 'Escalation / write-off',
  }[action] || action;
}

module.exports = { processInvoice, executeApproved };
