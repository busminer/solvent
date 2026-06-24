// messages/templates.js — warm copy for each stage.
// This is the soul of the project: "unpaid != unwilling". Default voice is a polite initiator, not a collector.
function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 }); }

module.exports = {
  gentle_reminder: (inv) =>
    inv.frictionCause === 'expired_card'
      ? `Hi — heads up that the card on file for invoice #${inv.id} (${money(inv.amount)}) expired, so the payment didn't go through. Nothing to worry about — here's a fresh link to complete it. Takes 30 seconds.`
      : `Hi ${firstName(inv.client)} — quick friendly note that invoice #${inv.id} (${money(inv.amount)}) is just past due. No stress at all if it slipped through — here's a one-tap link to settle it whenever suits you. Thanks for the great work together!`,

  firm_reminder: (inv) =>
    `Hi team — following up on invoice #${inv.id} (${money(inv.amount)}), now ${inv.daysOverdue} days past due. Could we settle this by Friday? Here's the payment link. Happy to jump on a quick call if anything's blocking it.`,

  payment_plan: (inv) =>
    `Hi — I know things are tight this month. For invoice #${inv.id} (${money(inv.amount)}) we can split it into 3 monthly payments, starting today. Want me to set that up? Here's the link for the first installment.`,

  settlement_offer: (inv, discount) => {
    const settle = Math.round(inv.amount * (1 - discount));
    return `Hi — invoice #${inv.id} (${money(inv.amount)}) is significantly overdue. As a final good-faith offer, we can settle it today at ${money(settle)} (${Math.round(discount * 100)}% off). Here's the link.`;
  },

  escalation: (inv) =>
    `[internal] Invoice #${inv.id} (${money(inv.amount)}), ${inv.daysOverdue}d overdue, unresponsive. Flagged for human decision: settlement discount or write-off.`,
};

function firstName(name) { return (name || '').split(' ')[0]; }
