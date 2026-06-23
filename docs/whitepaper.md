# SOLVENT — Whitepaper

**The agentic receivables operator for Stripe invoices.**

*An agent that recovers revenue you have already earned — by gently reminding, not aggressively collecting.*

---

## The thesis: unpaid is not unwilling

Most overdue invoices are not acts of refusal. They are acts of friction.

A business does not get paid late because its customer decided not to pay. It gets paid late because something small got in the way and nobody moved it:

- The invoice was received, then buried under a hundred other emails.
- The person who owes the money simply forgot — there was no malice, only a calendar that filled up.
- An internal approval chain stalled on someone's desk.
- The card on file expired, or a bank transfer failed silently and no one noticed.
- The customer is themselves waiting to be paid before they pay you.

In the overwhelming majority of cases, the money is not in dispute. The obligation is real, acknowledged, and recoverable. All that is missing is a timely, polite nudge — someone, or something, to surface the obligation again and make paying effortless.

This reframing is the soul of SOLVENT. Traditional collections is adversarial: it assumes the debtor is an opponent. But for legitimate receivables — freelancers, agencies, studios, SaaS, B2B services — the right posture is not a hammer. It is a courteous initiator: warm by default, escalating only when warmth fails, and never crossing an irreversible line without a human's say-so.

SOLVENT is built on that posture. It is not a debt collector. It is a gentle, tireless, well-mannered reminder that an obligation exists — paired with a one-tap way to settle it.

## Why this matters

Unmanaged receivables quietly kill small businesses. The money has already been earned; the work is done; the value was delivered. But cash that arrives sixty days late — or never — is the difference between a healthy business and a dying one. Late payment is one of the most common reasons small companies run out of runway despite being profitable on paper.

And yet almost no one manages receivables like the recovery operation it deserves to be. Follow-ups are late and inconsistent. Discounts are offered at random, out of frustration. Tone is either too soft to work or too harsh to keep the relationship. The whole process is dreaded, so it is neglected — and neglect is exactly what lets recoverable money slip away.

There is also a relationship cost that clumsy collection ignores. A blunt, automated "PAY NOW" message can recover one invoice and lose a client forever. The art — the thing Alex understands from real experience — is knowing *when* to stay gentle, *when* to firm up, *when* to offer a payment plan, and *who* should never be pushed at all. That judgment is what SOLVENT encodes.

## The SOLVENT approach: a gentle initiator with judgment

SOLVENT turns each overdue invoice into a managed *recovery case* rather than a forgotten line item. For every case, it does what a thoughtful human operator would do — at the right time, in the right tone, every time, without ever getting tired or emotional.

The agent's default posture is the softest one that could work. It begins as a courteous reminder that simply re-surfaces the obligation and provides a frictionless way to pay. Only if gentle reminders go unanswered does it consider firmer tones, payment plans, or time-limited incentives — and the most sensitive of those steps are never taken autonomously.

The recovery strategy is chosen per case, informed by the amount, how overdue it is, the customer's history, and a set of escalation rules written from real-world collections intuition. The same arrears handled the same way every time is what separates a recovery *operation* from a stack of ignored reminders.

### The recovery stages

SOLVENT moves a case along a deliberate ladder, starting soft and escalating slowly:

1. **Gentle reminder** — a warm, low-pressure nudge that the invoice is outstanding, with a one-tap payment link.
2. **Firm reminder with a deadline** — clearer, still respectful, with a concrete date.
3. **Payment plan offer** — for larger balances or customers signalling cashflow strain, a structured way to pay over time.
4. **Time-limited incentive** — a small "settle today" discount, used sparingly and never by the agent alone.
5. **Escalation / write-off** — the case is flagged for human decision: pursue harder, or recognise it as uncollectable.

The lower rungs are the default and the workhorses, because most money is recovered there — through nothing more than a timely, polite reminder. The upper rungs exist, but they are the exception, and they are gated.

## Safety and trust: the human holds the line

An agent that can send messages to customers and move money must be trustworthy by construction, not by promise. SOLVENT enforces this in code, not in a prompt.

Soft, low-risk actions — a gentle first reminder — can clear automatically. But every irreversible or relationship-sensitive action waits for a single human tap:

- Firm or aggressive messaging
- Any discount
- Any payment plan
- Any write-off
- Any send to an external recipient

These pending actions queue up and surface to the human operator (for Alex, as a tap in Telegram). Each risky action is also screened by an NVIDIA Nemotron Content Safety pass that classifies it as safe, needs-review, or blocked against the recovery policy. The classifier can flag an action as riskier, but it never relaxes a limit: the gate always applies the *stricter* of the model's verdict and the hard caps enforced in code. A discount above the configured cap is refused in code, regardless of what any model returns. The human holds the caps, and the caps are absolute.

This is not a footnote. It is the viability story. An agent you can actually trust near your customers and your revenue is one where the irreversible decisions remain yours.

## The money loop

SOLVENT is a small, complete autonomous economic unit — it earns and it spends, transparently.

**It earns.** When a recovery case settles, the customer pays through a Stripe-hosted payment link. Recovered revenue lands on a live ledger.

**It spends.** The reasoning, the message generation, the risk screening — each costs a small amount of inference. The agent tracks and pays for its own operating cost, and crucially it spends *intelligently*: it does not burn expensive analysis on a case the cheap signals say is routine. It manages its own margin.

The result is a single, legible figure that proves the entire thesis at a glance:

> Recovered $X · Agent cost $Y · **Net recovered $Z** · Every irreversible action human-approved.

Most agents try to invent new revenue. SOLVENT recovers revenue that was already owed — which is a smaller, sharper, and far more believable claim.

## Architecture at a glance

- **Data** — overdue invoices, drawn from Stripe (test mode for demonstration, a live account in production). This is the receivables book.
- **Brain** — a reasoning pass (Hermes / Nemotron) that reads each case and selects a recovery stage according to the escalation rules.
- **Action** — generates the right message in the right tone and attaches a working Stripe payment link; external sends wait for approval.
- **Agent treasury** — logs and pays the agent's own operating cost; surfaces the live P&L.
- **Human-in-the-loop** — an approval queue for every irreversible step, with deterministic caps in code and an NVIDIA Nemotron Content Safety screen; the gate applies the stricter of the two, so safety can only tighten, never loosen.

The pipeline ties the three hackathon foundations into one flow: **Hermes decides, NVIDIA Nemotron screens, Stripe settles** — and the human keeps the caps.

## Positioning

The strongest comparable submission frames an agent as an *autonomous business that earns by performing compute jobs* — impressive, but abstract. No small business wakes up needing an agent that rents GPUs.

SOLVENT answers a question every business already feels:

> *Can an agent recover the money my business already earned but hasn't collected yet?*

That is a narrower, more concrete, and more universally understood pain. The differentiator, in one line:

> **Most agents create new revenue. SOLVENT recovers revenue that is already owed — gently.**

## Scope discipline

The win is a narrow, complete loop, not a sprawling platform. The deliberate scope is: overdue invoices, recovery strategy, the approval queue, and the P&L. No email integrations, no CRM, no extra channels. A focused demo — a handful of overdue invoices walked through their stages, the human approving the sensitive steps, and the net-recovered figure ticking up — is more convincing than a half-built suite.

## What's next

The single missing ingredient is the escalation policy itself — the real-world rules for when to firm up, when to offer a plan, when to discount, and when to write off. Those rules become the agent's character. With them in hand, the build is assembly, not invention.

---

*SOLVENT — built for the Hermes Agent Accelerated Business Hackathon. Hermes by Nous Research · Nemotron by NVIDIA · Payments by Stripe.*
