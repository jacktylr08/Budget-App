# Budget

A monthly budget tracker built from the logic of the Financial Plan spreadsheet. Drop in a
payslip each month, and every penny of take-home is allocated down the same waterfall the
workbook used — fixed costs, one-offs, guilt-free spending, savings, sinking funds, then debt,
with anything left spilling into savings.

Everything runs in the browser. There is no server and no account; the plan is stored in
`localStorage` and can be exported to a JSON file at any time.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm test           # engine and payslip parser tests
```

`dist/` is a static bundle — host it anywhere, or open it locally.

## Deploying to Railway

The repo is ready to deploy as-is: `railway.json` tells Railway to run
`npm ci && npm run build`, then `npm start`, which serves `dist/` from `server.js` on
Railway's `$PORT`. No Dockerfile and no runtime dependencies.

**From the dashboard** (no CLI needed): New Project → Deploy from GitHub repo → pick this
repo and branch → Settings → Networking → Generate Domain. Every push to that branch
redeploys.

**From the CLI:**

```bash
npm i -g @railway/cli
railway login
railway init          # or: railway link   to attach an existing project
railway up
railway domain        # generate a public URL
```

No environment variables are required — the app has no backend and no secrets.

### One thing to know before you deploy

The plan lives in the browser's `localStorage`, which is scoped to the address it was
loaded from. A Railway URL is a different address from a local `npm run dev`, so it starts
empty. Use Settings → Export backup on the old one and Import on the new one to carry a
plan across, and note that a custom domain change moves the goalposts the same way.

## The pages

| Page | What it is for |
|---|---|
| **Dashboard** | Net position, savings, debt and fund balances over time, plus anything that needs a decision (a month that does not balance, an overcommitted month, a missing payslip). |
| **This month** | One month in detail. Import the payslip, adjust the lines, watch the allocation waterfall, and track guilt-free spending against a projected run-out date. |
| **Plan** | The whole plan as a grid — the workbook view. Every cell is editable; blue figures are overrides for that month, grey ones come from the defaults. |
| **Rules** | Your own operating rules, in Markdown. The part the arithmetic cannot do. |
| **Settings** | Fixed cost lines, sinking funds, debts, defaults, the plan window, payslip label mappings, and backup/restore. |

## Importing a payslip

On **This month**, drop a payslip PDF (or paste its text) into the import box. The parser
looks for the labels configured in Settings → Payslip labels, and shows what it matched,
with the line it came from, before anything is written. Nothing changes until you press
Apply.

- The pay date is detected from the document, so the figures land on the right month even if
  you import late.
- Where a payslip prints its own net pay, that figure is used verbatim rather than
  recalculated — so the plan always reflects what actually hit the account. A mismatch
  between the two is flagged rather than hidden.
- Scanned image payslips have no text to read; type the figures into the preview instead.

## Spending this month

The guilt-free budget gets its own card, because a single running total cannot answer the
question that actually matters mid-month: *I spent £100 on the first Saturday — am I in
trouble?*

Log spends as they happen (date, amount, note). Anything at or above the "a night out costs
at least" threshold in Settings is classed as a **big night** and kept separate from
**everyday spending**, which is what makes the projections trustworthy:

- **Everyday spending only** — your day-to-day rate carried to month end, assuming no more
  big nights. This is the headline run-out date, because it is the one you control by
  changing habits rather than cancelling plans.
- **Out every Fri/Sat** — everyday spending plus a night out on every remaining Friday and
  Saturday at their typical cost. A ceiling, not a forecast.

A naive daily average is deliberately not used anywhere. Two days into a month, one £100
night averages to £58 a day and predicts disaster; that number is noise, and acting on it is
what makes an ordinary Saturday feel like a crisis.

The card also gives the safe daily allowance from today, how many more nights out fit inside
what is left, how many no-spend days would put you back on the pace line, and how many
Friday/Saturday nights remain to spread it across. Underneath, up to four tips translate
those figures into a decision. When the budget is gone they point the damage at the debt and
spillover line rather than at savings, in line with the rules.

## How a month is calculated

```
net take-home  = gross + bonus + reimbursements − tax − NI − pension − student loan
                 (or the payslip's own net pay figure, when present)

available      = net − fixed costs − one-offs − guilt-free − savings contribution
                     − sinking fund contributions − fixed debt payments

for each automatic debt, in priority order:
    payment    = MIN(balance owed, MAX(0, available))
    available -= payment

spillover      = MAX(0, available)          → added to savings
savings        = previous savings + contribution + spillover
fund balance   = previous balance + contribution − spend
net position   = savings + funds − debts
```

The balance check on every month is `net − total allocated`, and it must be zero. If it is
not, the Dashboard says so.

Two behaviours are worth knowing:

- **A sinking fund with "stop at target" ticked** trims its contribution so the balance never
  overshoots the target.
- **A shortfall does not touch savings.** If you commit more than you earn, `available` goes
  negative, the automatic debt payment falls to zero and the month is flagged as
  overcommitted — the debt line is the shock absorber, by design.

## Verification

`src/engine.test.ts` runs the seeded plan through the engine and asserts it reproduces the
original workbook's own computed values — net pay, fixed subtotals, savings running total,
each fund balance, the debt waterfall, spillover, and net position — for all eleven months.
`src/payslip.test.ts` covers the parser against typical payslip layouts.

## Where the data lives

`localStorage`, under `budget-app.state.v1`. Clearing site data wipes the plan, so use
Settings → Export backup periodically; Import restores a backup on any machine.
