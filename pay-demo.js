// pay-demo.js
//
// Demo helper: settle every OPEN invoice in your Stripe test account with the
// test Visa (pm_card_visa), so the dashboard shows clean "Succeeded + VISA 4242"
// rows. Deterministic — run it and every open invoice ends up paid by Visa.
//
// This does NOT touch the agent. It only simulates the customers completing
// payment on the hosted links, which is what makes the Stripe dashboard pretty
// for the demo recording.
//
//   node pay-demo.js
//
// Test mode only. Requires STRIPE_SECRET_KEY (sk_test_/rk_test_) in .env.

require('dotenv').config();

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('No STRIPE_SECRET_KEY in .env — nothing to do.');
  process.exit(1);
}
if (!/^(sk|rk)_test_/.test(key)) {
  console.error('Refusing to run: key is not a TEST key (sk_test_/rk_test_).');
  process.exit(1);
}

const stripe = require('stripe')(key);

// Reuse an already-attached Visa if present, otherwise attach the test one.
// Avoids piling up duplicate payment methods on repeated runs.
async function ensureVisa(customerId) {
  const existing = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 20,
  });
  const found = existing.data.find((pm) => pm.card && pm.card.last4 === '4242');
  if (found) return found.id;

  const attached = await stripe.paymentMethods.attach('pm_card_visa', {
    customer: customerId,
  });
  return attached.id;
}

async function settleInvoice(inv) {
  const amount = (inv.amount_due / 100).toFixed(2);
  const label = `${inv.id}  $${amount}`;

  if (!inv.customer) {
    console.log(`  SKIP  ${label}  (no customer)`);
    return { skipped: true };
  }

  // Finalize a draft so it can be paid (open invoices are already finalized).
  let invoice = inv;
  if (invoice.status === 'draft') {
    invoice = await stripe.invoices.finalizeInvoice(invoice.id);
  }

  const pmId = await ensureVisa(invoice.customer);

  // Make the Visa the customer's default for invoices, then pay with it.
  await stripe.customers.update(invoice.customer, {
    invoice_settings: { default_payment_method: pmId },
  });

  const paid = await stripe.invoices.pay(invoice.id, { payment_method: pmId });
  console.log(`  PAID  ${label}  ->  ${paid.status}  (VISA 4242)`);
  return { paid: true, amount: Number(amount) };
}

async function main() {
  console.log('\n  SOLVENT — settling open invoices with the test Visa\n');

  const open = await stripe.invoices.list({ status: 'open', limit: 100 });
  if (!open.data.length) {
    console.log('  No open invoices. Run `node reset-seed.js` first.\n');
    return;
  }

  let total = 0;
  let count = 0;
  for (const inv of open.data) {
    try {
      const r = await settleInvoice(inv);
      if (r.paid) {
        total += r.amount;
        count += 1;
      }
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (/already paid/i.test(msg)) {
        console.log(`  OK    ${inv.id}  (already paid)`);
      } else {
        console.log(`  FAIL  ${inv.id}  -> ${msg}`);
      }
    }
  }

  console.log(`\n  Done. Settled ${count} invoice(s), $${total.toFixed(2)} total.`);
  console.log('  Open the Stripe dashboard — Payments should be green VISA 4242.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
