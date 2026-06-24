// seed.js — creates 5 curated invoices as REAL Stripe test-mode invoices.
//
// Run ONCE locally after putting your test key in .env:
//     node src/seed.js
// Creates a test customer and 5 open invoices
// with metadata (frictionCause/history/neverPush/ref) that policy.js reads.
// Idempotent: re-running skips invoices already created (by metadata.ref).
//
// No real money moves — test mode. Test card: 4242 4242 4242 4242.

const { useRealStripe, stripeKey } = require('./config');
const seedInvoices = require('./data/invoices');

if (!useRealStripe) {
  console.error('\n  x No STRIPE_SECRET_KEY in .env — nothing to seed.');
  console.error('    Copy .env.example → .env, add your test key, and run again.\n');
  process.exit(1);
}

const stripe = require('stripe')(stripeKey);
const DAY = 86400;

async function main() {
  console.log('\n  SOLVENT seed — creating 5 test invoices in Stripe (test mode)\n');

  // Dedupe guard: which refs are already seeded.
  const existing = await stripe.invoices.list({ status: 'open', limit: 100 });
  const seededRefs = new Set(
    existing.data.map((i) => i.metadata && i.metadata.ref).filter(Boolean)
  );

  for (const inv of seedInvoices) {
    const ref = String(inv.id);
    if (seededRefs.has(ref)) {
      console.log(`  - #${ref} ${inv.client} — already exists, skipping`);
      continue;
    }

    // 1) A customer per case (name shows in the dashboard and the pull).
    const customer = await stripe.customers.create({
      name: inv.client,
      email: `kase-${ref}@solvent.test`,
    });

    // 2) Invoice line item (amount in cents).
    await stripe.invoiceItems.create({
      customer: customer.id,
      amount: Math.round(inv.amount * 100),
      currency: 'usd',
      description: `Outstanding balance — case #${ref}`,
    });

    // 3) Invoice. Stripe requires a FUTURE due_date at creation, so we set
    //    a valid future date, while the real overdue age lives in metadata.daysOverdue
    //    (the agent reads the overdue age from there — see integrations/stripe.js).
    const dueDate = Math.floor(Date.now() / 1000) + 30 * DAY; // future — required by Stripe
    let created = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      due_date: dueDate,
      metadata: {
        ref,
        client: inv.client,
        history: inv.history,
        frictionCause: inv.frictionCause,
        neverPush: String(Boolean(inv.neverPush)),
        daysOverdue: String(inv.daysOverdue),
      },
    });

    // 4) Finalize → status open, hosted_invoice_url appears.
    created = await stripe.invoices.finalizeInvoice(created.id);

    console.log(
      `  ✓ #${ref} ${inv.client} — $${inv.amount}, ${inv.daysOverdue}d overdue ` +
      `(${inv.frictionCause}) → ${created.hosted_invoice_url}`
    );
  }

  console.log('\n  Done. Now: npm start — the agent will pull these invoices from Stripe.\n');
}

main().catch((e) => {
  console.error('\n  x Seed error:', e.message, '\n');
  process.exit(1);
});
