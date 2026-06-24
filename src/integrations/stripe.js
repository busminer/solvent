// integrations/stripe.js — Stripe wrapper (TEST MODE).
// No key -> mock data, so the project runs immediately. With a key -> real Stripe test mode.
const { useRealStripe, stripeKey } = require('../config');
const mockInvoices = require('../data/invoices');
const { trace } = require('../util/trace');

let stripe = null;
if (useRealStripe) {
  // load the SDK only if a key exists (so the project also starts on mock without npm install)
  stripe = require('stripe')(stripeKey);
}

/**
 * Pulls overdue invoices. With a key, reads our seeded test-mode invoices from Stripe.
 */
async function listOverdueInvoices() {
  if (!useRealStripe) return mockInvoices;

  // ── real version (Stripe test mode) ──
  // Read open invoices and restore the rich fields from metadata (set by seed.js),
  // so policy.js sees exactly the same frictionCause/history/neverPush.
  trace('STRIPE', '→ GET api.stripe.com/v1/invoices?status=open   (test mode)');
  const t0 = Date.now();
  const res = await stripe.invoices.list({ status: 'open', limit: 100 });
  trace('STRIPE', `← 200 OK   ${res.data.length} invoices   ${Date.now() - t0}ms`);
  const overdue = res.data
    .filter((i) => i.metadata && i.metadata.ref) // our seeded cases (seed.js)
    .map((i) => {
      const m = i.metadata || {};
      return {
        id: m.ref || i.number,
        client: i.customer_name || m.client || i.customer_email,
        amount: i.amount_due / 100,
        daysOverdue: parseInt(m.daysOverdue, 10) || 0, // overdue age from metadata
        history: m.history || 'unknown',
        frictionCause: m.frictionCause || 'oversight',
        neverPush: m.neverPush === 'true',
        _stripeId: i.id,
      };
    })
    .sort((a, b) => Number(a.id) - Number(b.id));

  // Key present but no invoices — hint to seed instead of failing silently.
  if (overdue.length === 0) {
    console.warn('  [STRIPE] No open overdue invoices found. Run: node src/seed.js');
  }
  return overdue;
}

/**
 * Returns the hosted payment link for an invoice.
 */
async function createPaymentLink(inv) {
  if (!useRealStripe) {
    return `https://pay.stripe.test/mock/${inv.id}`;
  }
  // ── real version ──
  // The invoice is already finalized in seed.js → return the real hosted link.
  // Just in case a draft slipped through, finalize it.
  trace('STRIPE', `→ GET api.stripe.com/v1/invoices/${inv._stripeId}   (hosted link)`);
  const t0 = Date.now();
  let s = await stripe.invoices.retrieve(inv._stripeId);
  if (s.status === 'draft') {
    s = await stripe.invoices.finalizeInvoice(inv._stripeId);
  }
  trace('STRIPE', `← 200 OK   ${s.status}   ${Date.now() - t0}ms`);
  return s.hosted_invoice_url || `https://pay.stripe.test/mock/${inv.id}`;
}

module.exports = { listOverdueInvoices, createPaymentLink, isReal: useRealStripe };
