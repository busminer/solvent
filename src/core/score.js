'use strict';

/**
 * SOLVENT - src/core/score.js
 *
 * scoreLikelihood(invoice) -> probability 0..1 that an overdue invoice is recovered.
 *
 * Why: the agent should not chase invoices in arbitrary order. It estimates where
 * the money will actually come back and spends effort there. The score alone is the
 * "who to touch" priority; score * amountDue is the expected recovery (see prioritize()).
 *
 * The model is a transparent weighted sum of sub-scores - not a black box. Every
 * factor is explainable, the weights live in WEIGHTS and are tunable, and we return
 * a breakdown so the dashboard / judges can see "why this score".
 *
 * CommonJS, no build step - same as the rest of the repo.
 */

// -- Model settings (tune here) -----------------------------------------------

const WEIGHTS = {
  aging: 0.35, // age of the overdue balance - the strongest predictor
  history: 0.2, // how this customer has paid in the past
  engagement: 0.2, // opened / clicked a reminder
  paymentMethod: 0.1, // is the card on file valid?
  attempts: 0.08, // how many times we have nudged without payment
  amount: 0.07, // mild penalty for very large balances
};

// Exponential decay of recovery probability by age of the overdue balance.
// tau is tuned to the project's dunning thresholds:
//   day 9 ~ 0.89 . day 45 ~ 0.55 . day 90 ~ 0.30 . day 120 (write-off) ~ 0.20
const AGING_TAU_DAYS = 75;

// Prior for a customer with no history, and neutral fallbacks when data is thin.
const NEUTRAL_HISTORY = 0.6;
const HISTORY_SHRINK_K = 3; // fewer invoices on record -> pull harder toward the prior

// Priority band thresholds.
const BAND_HIGH = 0.66;
const BAND_MEDIUM = 0.4;

// -- Utilities ----------------------------------------------------------------

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const num = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);

// -- Sub-scores (each returns 0..1) -------------------------------------------

function scoreAging(daysOverdue) {
  const d = Math.max(0, num(daysOverdue, 0));
  return clamp(Math.exp(-d / AGING_TAU_DAYS));
}

function scoreHistory(customer = {}) {
  const paid = Math.max(0, num(customer.invoicesPaid, 0));
  const missed = Math.max(0, num(customer.invoicesMissed, 0));
  const n = paid + missed;

  // An explicit onTimeRate wins; otherwise derive it from paid/missed.
  let observed;
  if (Number.isFinite(customer.onTimeRate)) {
    observed = clamp(customer.onTimeRate);
  } else if (n > 0) {
    observed = paid / n;
  } else {
    return NEUTRAL_HISTORY; // no data - stay neutral
  }

  // Shrink toward the prior: little history -> trust the observed rate less.
  const w = n / (n + HISTORY_SHRINK_K);
  return clamp(w * observed + (1 - w) * NEUTRAL_HISTORY);
}

function scoreEngagement(engagement = {}) {
  if (engagement.clicked) return 0.95; // clicked the payment link - hot
  if (engagement.opened) return 0.75; // opened but did not pay - warm
  return 0.45; // silence - mildly negative
}

function scorePaymentMethod(paymentMethod) {
  switch (paymentMethod) {
    case 'valid':
      return 1.0;
    case 'expired':
      return 0.8; // frictional non-payment - cured by an "update your card" nudge
    case 'none':
      return 0.55;
    default:
      return 0.7; // unknown - slightly positive prior
  }
}

function scoreAttempts(contactAttempts) {
  const a = Math.max(0, num(contactAttempts, 0));
  // The easy ones already paid; each unanswered attempt lowers the odds a little.
  return clamp(1 - 0.08 * a, 0.5, 1);
}

function scoreAmount(amountDue) {
  const amt = Math.max(0, num(amountDue, 0));
  if (amt <= 500) return 1.0; // small balances are often just forgotten
  // Mild log penalty for large balances: paying in full at once is less likely.
  // $5k ~ 0.82 . $50k ~ 0.64. Floor is 0.55 (a payment-plan path still exists).
  return clamp(1 - 0.18 * Math.log10(amt / 500), 0.55, 1);
}

// -- Main function ------------------------------------------------------------

/**
 * @param {object} invoice
 * @param {string} [invoice.id]
 * @param {number} [invoice.amountDue]      amount in major units ($, not cents)
 * @param {string} [invoice.currency]
 * @param {number} [invoice.daysOverdue]
 * @param {object} [invoice.customer]       { onTimeRate?, invoicesPaid?, invoicesMissed? }
 * @param {object} [invoice.engagement]     { opened?, clicked? }
 * @param {string} [invoice.paymentMethod]  'valid' | 'expired' | 'none'
 * @param {number} [invoice.contactAttempts]
 * @param {boolean} [invoice.neverPush]     does not affect the score (it is about tone)
 * @returns {{ score:number, band:'high'|'medium'|'low', factors:Array }}
 */
function scoreLikelihood(invoice = {}) {
  const subscores = {
    aging: scoreAging(invoice.daysOverdue),
    history: scoreHistory(invoice.customer),
    engagement: scoreEngagement(invoice.engagement),
    paymentMethod: scorePaymentMethod(invoice.paymentMethod),
    attempts: scoreAttempts(invoice.contactAttempts),
    amount: scoreAmount(invoice.amountDue),
  };

  let score = 0;
  const factors = [];
  for (const key of Object.keys(WEIGHTS)) {
    const weight = WEIGHTS[key];
    const value = subscores[key];
    const contribution = weight * value;
    score += contribution;
    factors.push({
      name: key,
      weight,
      value: round(value),
      contribution: round(contribution),
    });
  }

  score = clamp(score);
  factors.sort((a, b) => b.contribution - a.contribution);

  return { score: round(score), band: toBand(score), factors };
}

function toBand(score) {
  if (score >= BAND_HIGH) return 'high';
  if (score >= BAND_MEDIUM) return 'medium';
  return 'low';
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * Queue prioritization: sort by expected recovery (score * amountDue).
 * This is what the agent actually consumes - where to spend effort first.
 * @returns {Array} the same list, enriched with { likelihood, expectedRecovery },
 *                  sorted by expectedRecovery descending.
 */
function prioritize(invoices = []) {
  return invoices
    .map((inv) => {
      const likelihood = scoreLikelihood(inv);
      const expectedRecovery = round(likelihood.score * Math.max(0, num(inv.amountDue, 0)));
      return { ...inv, likelihood, expectedRecovery };
    })
    .sort((a, b) => b.expectedRecovery - a.expectedRecovery);
}

module.exports = { scoreLikelihood, prioritize, WEIGHTS, AGING_TAU_DAYS };

// -- Demo run: `node src/core/score.js` ---------------------------------------

if (require.main === module) {
  const sample = [
    {
      id: 'in_freshSmall',
      amountDue: 180,
      daysOverdue: 4,
      paymentMethod: 'valid',
      engagement: { opened: true },
      contactAttempts: 1,
      customer: { invoicesPaid: 9, invoicesMissed: 1 },
    },
    {
      id: 'in_bigStale',
      amountDue: 24000,
      daysOverdue: 95,
      paymentMethod: 'none',
      engagement: {},
      contactAttempts: 5,
      customer: { invoicesPaid: 1, invoicesMissed: 4 },
    },
    {
      id: 'in_expiredCardWarm',
      amountDue: 1200,
      daysOverdue: 18,
      paymentMethod: 'expired',
      engagement: { opened: true, clicked: true },
      contactAttempts: 2,
      customer: { onTimeRate: 0.85, invoicesPaid: 12, invoicesMissed: 2 },
    },
    {
      id: 'in_newCustomerMid',
      amountDue: 3000,
      daysOverdue: 30,
      paymentMethod: 'valid',
      engagement: {},
      contactAttempts: 0,
      customer: {},
    },
    {
      id: 'in_writeOffZone',
      amountDue: 800,
      daysOverdue: 130,
      paymentMethod: 'none',
      engagement: {},
      contactAttempts: 7,
      customer: { invoicesPaid: 0, invoicesMissed: 3 },
    },
  ];

  console.log('\nSOLVENT . scoreLikelihood - recovery priority queue\n');
  const ranked = prioritize(sample);
  for (const inv of ranked) {
    const { score, band } = inv.likelihood;
    const top = inv.likelihood.factors[0];
    console.log(
      `${pad(inv.id, 20)} $${pad(inv.amountDue, 7)}  ${pad(inv.daysOverdue + 'd', 5)}` +
        `  p=${score.toFixed(2)} [${pad(band, 6)}]` +
        `  E[recover]=$${inv.expectedRecovery.toFixed(0)}` +
        `  driver: ${top.name}`
    );
  }
  console.log('');
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
