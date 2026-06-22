// diag.js — diagnostics: what's actually in your Stripe account.
// Place next to package.json and run:  node diag.js
require('dotenv').config();

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.log('\n  x No STRIPE_SECRET_KEY in .env. Stop.\n'); process.exit(1); }
console.log('\n  Key from .env: ' + key.slice(0, 12) + '…  (mode: ' + (/^(sk|rk)_test_/.test(key) ? 'TEST' : 'NOT test') + ')');

const stripe = require('stripe')(key);

(async () => {
  const open = await stripe.invoices.list({ status: 'open', limit: 100 });
  console.log('\n  OPEN invoices: ' + open.data.length);
  open.data.forEach(i => console.log(
    '    ' + i.id + ' | status=' + i.status + ' | $' + (i.amount_due / 100) +
    ' | ref=' + (i.metadata && i.metadata.ref) + ' | daysOverdue=' + (i.metadata && i.metadata.daysOverdue)
  ));

  const all = await stripe.invoices.list({ limit: 100 });
  console.log('\n  ALL invoices (any status): ' + all.data.length);
  all.data.forEach(i => console.log(
    '    ' + i.id + ' | status=' + i.status + ' | $' + (i.amount_due / 100) +
    ' | ref=' + (i.metadata && i.metadata.ref)
  ));
  console.log('');
})().catch(e => console.error('\n  x Stripe error: ' + e.message + '\n'));
