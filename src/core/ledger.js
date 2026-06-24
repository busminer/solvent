// core/ledger.js — the agent's treasury (P&L). The ticking "Net recovered" board.
class Ledger {
  constructor() {
    this.recovered = 0;
    this.cost = 0;
    this.resolved = 0;
    this.total = 0; // total cases in flight
  }
  setTotal(n) { this.total = n; }
  recordRecovery(amount) { this.recovered += round(amount); this.resolved += 1; }
  recordCost(amount) { this.cost += round(amount); }
  net() { return round(this.recovered - this.cost); }
  roi() { return this.cost > 0 ? Math.round(this.net() / this.cost) : null; }
  summary() {
    return {
      recovered: this.recovered,
      agentCost: round(this.cost),
      netRecovered: this.net(),
      roi: this.roi(),
      resolved: `${this.resolved} / ${this.total}`,
    };
  }
}
function round(n) { return Math.round(n * 100) / 100; }
module.exports = Ledger;
