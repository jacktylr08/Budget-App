# Budget

A monthly budget tracker built from the logic of the Financial Plan spreadsheet. Drop in a
payslip each month, and every penny of take-home is allocated down the same waterfall the
workbook used — fixed costs, one-offs, guilt-free spending, savings, sinking funds, then debt,
with anything left spilling into savings.

Everything runs in the browser. There is no server and no account; the plan is stored in
`localStorage` and can be exported to a JSON file at any time.

It is built for a phone as much as a laptop: bottom navigation within thumb reach, sections
that collapse instead of forming an endless column, the plan as a list of months rather than
a grid dragged sideways, and no horizontal page scrolling anywhere.

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

The first thing on the month page, because it is the thing checked most often. It answers
the question that actually causes stress mid-month — *I spent £100 on the first Saturday, am
I in trouble?* — and the honest answer is a range with odds attached, not a number.

### The forecast

Real months are mostly quiet days with a few £50 ones, so no single projected line can
describe them. Instead the rest of the month is **simulated**: days are drawn at random from
the days you have actually had — zeros included — and the month is replayed a couple of
thousand times. Fridays and Saturdays are drawn from your own Fridays and Saturdays, once
there are enough of them to mean something.

That produces the four figures at the top of the card:

| Figure | What it is |
|---|---|
| **Left to spend** | Budget minus what has gone. |
| **Heading for** | Where the month lands in the middle of the simulations. |
| **Chance of staying in** | Share of simulated months that finish at or under budget. |
| **Safe per day** | What is left spread evenly — an average, labelled as one. |

Under them, **what that covers**, in the shape a month really takes: *21 quiet days, 5 days
at ~£20, 4 nights out*. Nights out are capped at the number of Fridays and Saturdays actually
left, because you cannot have seven of them in six weekends.

The chart shows what has been spent, then a shaded band for the middle 80% of simulated
outcomes. The band widens exactly as far as your own variation justifies — no further.

Two things this deliberately does **not** do:

- **No invented worst case.** An earlier version showed "out every Friday and Saturday",
  which produced numbers like £1,500 on a £575 budget. It was arithmetically true and
  completely useless.
- **No straight-line scolding.** The verdict badge comes from the odds, not from whether
  today sits above an even-pace line. One big night on the 1st puts you "over pace" for a
  fortnight while the month is, in fact, fine.

A "big night" is a **day** whose total clears the threshold in Settings, not a single
payment — a night out is a bar, a taxi and a kebab. When this month is only a few days old,
earlier months' logs are used as the sample, and the card says so rather than pretending to
precision it has not earned.

### Logging it

Three ways, switchable at any time on the card:

- **Running total** — one number you update when you check your bank. No dates, so the
  projection has to assume even spending.
- **Log each spend** — date, amount, note. This is what makes the projections real.
- **Import a Monzo CSV** — Monzo app → Account → Statements → Export as CSV. Categories are
  listed with totals so you choose what counts as guilt-free; rent, bills and transfers are
  off by default because the plan budgets them elsewhere. Re-importing the same file adds
  nothing twice, and hand-typed entries are never touched.

### The History page

Reads whatever is in your spend logs and reports what the plan's figures *should* be set
from. It windows to the last 12 months by default — a five-year export otherwise drowns the
recent signal — with 6-month, 2-year and everything options. It shows: what each month actually cost against the budget, the spread between your cheapest and
dearest month, how your days fall (quiet days, typical spend day, and the percentiles above
it), and the day-of-week pattern. Where the budget and the evidence disagree by more than
£20, it says so and offers to set the budget to the evidence.

Import is per-file, not per-month: a year of Monzo history lands in one go, split into a log
per month, which is what makes the forecast trustworthy from day one rather than after a
fortnight of logging.

**Import every account you spend from.** A spending Pot usually holds only part of the
picture — day-to-day spending that runs through the main balance is invisible if you import
the Pot alone, and a budget set from the Pot alone will be set far too low. Transaction IDs
are unique, so importing the main account and a Pot adds them together rather than
double-counting.

### Why Monzo is not connected directly

The **per-Pot CSV export** — taken from inside the Pot in the Monzo app — *does* contain the
card payments made from that Pot. That is the file to import for a spending Pot, and it is
the one route that sees Pot spending at all. What follows is why nothing automatic does:

1. **Pot transactions are not exposed to the API.** It returns Pot balances and lets you
   deposit and withdraw, but not what happened inside a Pot. This is a long-standing,
   acknowledged gap — and it is why the manual per-Pot export is the only route.
   ([Monzo docs](https://docs.monzo.com/), [community request](https://community.monzo.com/t/expose-pot-transaction-data-via-public-api-parity-with-main-account-transactions/193089))
2. **The developer API is not for apps.** Monzo states it "is not suitable for building
   public applications" — own account or a small whitelist only. It also needs a client
   secret, which a browser-only app cannot hold, and after five minutes from authentication
   only the last 90 days of transactions are readable. ([Monzo docs](https://docs.monzo.com/))
3. **Open Banking aggregators do not help.** TrueLayer, Plaid, Yapily and the rest read the
   same Open Banking account data, which has no Pot-level detail, and they need a backend
   plus re-consent every 90 days. GoCardless Bank Account Data, the one with a free tier, has
   stopped onboarding new customers.
   ([aggregator list](https://www.openbankingtracker.com/provider/monzo))

The **main-account** CSV has the same blind spot as the API: payments made directly from a
Pot are missing from it, as they are from Monzo's own Plus auto-export.
([community](https://community.monzo.com/t/auto-export-transactions-that-are-made-directly-from-pots/124567))
The per-Pot export is the workaround, and it is manual — a file you take from the app each
month, not a connection.

Whichever file you use, transfers between Pots are detected and excluded (moving money is not
spending), and so are payments to investment platforms — Trading 212, Vanguard, Moneybox and
the like. A single £1,670 transfer to Trading 212 sitting in a spending export otherwise
reads as the most expensive month of the year.

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
`src/payslip.test.ts` covers the parser against typical payslip layouts. `src/spending.test.ts`
covers the projections — including the first-Saturday big night, lumpy spending with no-spend
days, and a night out spread across six transactions. `src/monzoCsv.test.ts` covers the
import, including Pot exclusion and re-import safety. `src/forecast.test.ts` covers the
simulation — that it is deterministic, that it keeps ranges plausible, and that it borrows
earlier months when this one is too young.

## Where the data lives

`localStorage`, under `budget-app.state.v1`. Clearing site data wipes the plan, so use
Settings → Export backup periodically; Import restores a backup on any machine.
