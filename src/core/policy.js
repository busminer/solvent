// core/policy.js — DECISION LAYER. This is the agent's "character".
//
// Thesis: "unpaid != unwilling" — default to the gentlest tone; firmness only as a last resort.
// These deterministic rules are the fallback when the Hermes model is unavailable, AND they
// define the code-enforced minimum stage (floor) that the model can never go below.
//
// Escalation stages (soft → hard):
//   1 gentle_reminder  — warm reminder + payment link            (auto)
//   2 firm_reminder    — firm, with a deadline, still respectful (needs approval)
//   3 payment_plan     — installments for large / cashflow cases (needs approval)
//   4 settlement_offer — "settle today" discount                 (needs approval)
//   5 escalation       — escalation / write-off                  (needs approval)

const STAGES = {
  1: 'gentle_reminder',
  2: 'firm_reminder',
  3: 'payment_plan',
  4: 'settlement_offer',
  5: 'escalation',
};

// ── Tunable rules (the collector's intuition lives here) ──
const RULES = {
  gentleUntilDays: 14,       // keep a soft tone up to this many days overdue
  firmFromDays: 15,          // switch to a firm tone from this day
  planMinAmount: 3000,       // offer a payment plan from this balance
  escalateFromDays: 45,      // when an invoice becomes a problem case
  alwaysApproveAmount: 1500, // any invoice at/above this NEVER goes out without approval (code floor)
};

/**
 * Code-enforced MINIMUM stage for an invoice (a floor, not a suggestion).
 * The model (Hermes) may choose a STRICTER stage, but never a softer one than this.
 * This is the decision-side mirror of the tighten-only safety screen: large or old
 * invoices can never be auto-sent — they are forced to at least `firm_reminder`,
 * which always routes through human approval.
 * @returns {number} minimum stage 1..5
 */
function minimumStage(inv) {
  if (inv.neverPush) return 1; // never-push clients are capped to gentle elsewhere
  let floor = 1; // gentle
  if (inv.daysOverdue >= RULES.firmFromDays) floor = 2;                                   // firm from day 15
  if (inv.amount >= RULES.alwaysApproveAmount) floor = Math.max(floor, 2);                // large balance → human
  if (inv.amount >= RULES.planMinAmount && inv.frictionCause === 'cashflow') floor = Math.max(floor, 3);
  if (inv.daysOverdue >= RULES.escalateFromDays && inv.history === 'none') floor = Math.max(floor, 5);
  return floor;
}

/**
 * Picks the recovery stage for an invoice (deterministic fallback when Hermes is off).
 * @returns {{ stage:number, action:string, reason:string }}
 */
function decideStage(inv) {
  const r = RULES;

  // "Never push" — flag for clients we must not pressure.
  if (inv.neverPush) {
    return mk(1, 'Client flagged neverPush — soft tone only, no escalation.');
  }

  // Expired card / silent payment failure is pure friction, not refusal. Gentle heads-up.
  if (inv.frictionCause === 'expired_card') {
    return mk(1, `${inv.daysOverdue}d overdue. Card expired — the payment failed silently. Pure friction: gentle heads-up + a fresh link.`);
  }

  // Long unresponsive + heavily overdue → problem case, leave the decision to a human.
  if (inv.daysOverdue >= r.escalateFromDays && inv.history === 'none') {
    return mk(5, `${inv.daysOverdue}d, no reply across several contacts. Low odds — flag for a human: discount or write-off.`);
  }

  // Large balance + cashflow signal → a plan recovers more than pressure.
  if (inv.amount >= r.planMinAmount && inv.frictionCause === 'cashflow') {
    return mk(3, `${inv.daysOverdue}d, large balance, client has cashflow strain. A plan recovers more than demanding it all at once.`);
  }

  // Firm tone with a deadline.
  if (inv.daysOverdue >= r.firmFromDays) {
    return mk(2, `${inv.daysOverdue}d overdue, the gentle nudge was ignored. Firm tone with a concrete date — still respectful.`);
  }

  // Default — the softest possible tone.
  return mk(1, `${inv.daysOverdue}d overdue, first lapse. Almost certainly forgotten, not refused. Softest possible nudge.`);

  function mk(stage, reason) {
    return { stage, action: STAGES[stage], reason };
  }
}

module.exports = { decideStage, minimumStage, STAGES, RULES };
