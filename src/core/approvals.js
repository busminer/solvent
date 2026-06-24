// core/approvals.js — approval queue (the human in the loop).
// Irreversible actions accumulate here and wait for a human tap (in production, a Telegram button).
class ApprovalQueue {
  constructor(notify) {
    this.items = [];
    this.notify = notify; // notification function (Telegram / console)
  }
  enqueue(item) {
    this.items.push(item); // { id, action, label, invoice, payload }
    if (this.notify) this.notify(`⏳ Approval needed: ${item.label}`);
    return item;
  }
  list() { return this.items.slice(); }
  pending() { return this.items.length; }

  // In production the decision comes from a human (Telegram tap). Here it's resolved programmatically.
  resolve(id, approved) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i === -1) return null;
    const [item] = this.items.splice(i, 1);
    item.approved = approved;
    return item;
  }
}
module.exports = ApprovalQueue;
