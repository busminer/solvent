// reset-seed.js — clean reset and re-creation of the 5 demo invoices in Stripe (test mode).
// Place next to package.json (project root) and run:  node reset-seed.js
require('dotenv').config();

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.log('\n  x No STRIPE_SECRET_KEY in .env.\n'); process.exit(1); }

const stripe = require('stripe')(key);
const seedInvoices = require('./src/data/invoices');
const DAY = 86400;

async function main() {
  console.log('\n  SOLVENT reset-seed — cleaning old invoices and creating 5 fresh ones\n');

  // 1) Clean up: open -> void, draft -> delete. Paid $0 leftovers are left as-is (not open, harmless).
  const all = await stripe.invoices.list({ limit: 100 });
  let voided = 0, deleted = 0;
  for (const i of all.data) {
    try {
      if (i.status === 'open') { await stripe.invoices.voidInvoice(i.id); voided++; }
      else if (i.status === 'draft') { await stripe.invoices.del(i.id); deleted++; }
    } catch (e) { /* ignore */ }
  }
  console.log('  Cleanup: voided=' + voided + ', drafts deleted=' + deleted + '\n');

  // 2) Recreate — line item is attached to the SPECIFIC invoice (guarantees the amount) + full metadata.
  for (const inv of seedInvoices) {
    const ref = String(inv.id);

    const customer = await stripe.customers.create({
      name: inv.client, email: 'case-' + ref + '@solvent.test',
    });

    // 2a) draft invoice with metadata
    let invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      currency: 'usd', // account default may be EUR — pin USD to match our amounts
      due_date: Math.floor(Date.now() / 1000) + 30 * DAY, // future — required by Stripe
      metadata: {
        ref,
        client: inv.client,
        history: inv.history,
        frictionCause: inv.frictionCause,
        neverPush: String(Boolean(inv.neverPush)),
        daysOverdue: String(inv.daysOverdue),
        solvent: 'demo',
      },
    });

    // 2b) line item attached to this exact invoice
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: Math.round(inv.amount * 100),
      currency: 'usd',
      description: 'Outstanding balance — case #' + ref,
    });

    // 2c) finalize -> open + hosted_invoice_url
    invoice = await stripe.invoices.finalizeInvoice(invoice.id);

    console.log('  + #' + ref + ' ' + inv.client + ' — $' + inv.amount +
      ', ' + inv.daysOverdue + 'd overdue (' + inv.frictionCause + ')');
  }

  console.log('\n  Done. Now run:  npm run demo\n');
}

main().catch(e => { console.error('\n  x Error: ' + e.message + '\n'); process.exit(1); });
