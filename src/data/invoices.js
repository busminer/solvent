// data/invoices.js — mock ledger of overdue invoices (the same set shown in the dashboard).
// In production this array is replaced by a Stripe pull (integrations/stripe.js → listOverdueInvoices).
module.exports = [
  {
    id: 1042,
    client: 'Maria Flux Studio',
    amount: 750,
    daysOverdue: 8,
    history: 'clean',           // clean | slow | none
    frictionCause: 'oversight', // oversight | expired_card | cashflow | unresponsive
    neverPush: false,
  },
  {
    id: 1051,
    client: 'Brightline Agency',
    amount: 2400,
    daysOverdue: 21,
    history: 'slow',
    frictionCause: 'oversight',
    neverPush: false,
  },
  {
    id: 1067,
    client: 'Nomad Coffee Co.',
    amount: 5200,
    daysOverdue: 34,
    history: 'slow',
    frictionCause: 'cashflow',
    neverPush: false,
  },
  {
    id: 1078,
    client: 'Vertex SaaS Ltd',
    amount: 1180,
    daysOverdue: 12,
    history: 'clean',
    frictionCause: 'expired_card',
    neverPush: false,
  },
  {
    id: 1090,
    client: 'Halcyon Media',
    amount: 890,
    daysOverdue: 58,
    history: 'none',
    frictionCause: 'unresponsive',
    neverPush: false,
  },
];
