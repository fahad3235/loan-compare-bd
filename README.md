# Loan Compare BD

Compare loan offers side by side before you borrow - an offline, bilingual
(English / Bangla) web app for Bangladesh.

Banks quote the same loan in different ways: one shows a low monthly EMI but
a high flat rate, another adds a big processing fee. Loan Compare BD puts up
to 4 offers in one table - EMI, total interest, fees, total cost and the
effective annual rate - and ranks them cheapest-first, so the real cheapest
offer is obvious instead of the one with the smallest headline number.

## Features

- **Add up to 4 loan offers** - lender name, loan type (personal / home /
  auto / business / education), amount, annual rate, tenure, interest method
  (reducing balance or flat rate), processing fee and other charges. Full
  input validation with per-field error messages.
- **Cheapest-first ranking** - offers are ranked by total cost (EMI x tenure
  + all fees), with a "Cheapest" badge and the amount each offer saves versus
  the most expensive one.
- **Side-by-side comparison table** - EMI, total interest, total paid to the
  bank, fees, total cost and effective annual rate for every offer. Flat-rate
  loans also show their true effective rate (solved from the reducing-balance
  EMI), so a "12% flat" loan is never mistaken for a "12% reducing" loan.
- **Repayment schedule** - first 12 months (interest / principal / balance
  left) plus a year-by-year roll-up for any offer.
- **Affordability check** - enter your monthly income and see each offer's
  EMI as a percentage of it, banded Comfortable (up to 40%), Tight (40-50%)
  or Risky (over 50%). The 40% figure is a common rule of thumb, labelled as
  such - not a bank rule. Income never leaves your device.
- **Bilingual EN / Bangla** - full UI toggle, persisted, with Bengali digits
  in Bengali mode and lakh-style grouping (BDT 5,00,000).
- **Local backup** - export offers as JSON, import a backup, or erase
  everything (type `DELETE` to confirm). No account, no server, no network
  requests at all.

## Stack

- Plain HTML + CSS + JavaScript - no framework, no build step, no
  dependencies, no CDN. Open `index.html` and it works.
- `js/core.js` - pure calculation + validation logic (EMI, flat-rate
  effective rate, ranking, amortization, affordability), unit-tested from
  Node with no DOM.
- `js/data.js` - loan types + one clearly-labelled example offer.
- `js/i18n.js` - EN/BN strings (generated from `.scratch/gen_i18n.py`;
  Bengali stored as `\uXXXX` escapes so sources stay pure ASCII).
- `js/app.js` - UI: tabs, forms, ranking, schedule, affordability, backup.
- State lives in `localStorage` under `loan-compare-bd-v1`.

## Prerequisites

Any modern browser. For the tests: Node.js 20+ (uses `node:test` and the
built-in WebSocket client; no npm packages needed).

## Install / run

```sh
# Just open it:
open index.html
# or serve it locally:
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Development commands

```sh
node --test tests/unit.test.mjs   # 16 unit tests
node tests/smoke.mjs 1280         # 38 headless-Chrome checks, desktop
node tests/smoke.mjs 390          # 38 headless-Chrome checks, mobile
python3 .scratch/gen_i18n.py     # regenerate js/i18n.js after editing strings
```

The smoke tests use the Playwright-cached `headless_shell` binary and raw
CDP - no Playwright install is needed.

## Environment

None. There are no API keys, no backend and no environment variables.

## Testing

- **Unit tests - 16/16 pass** (`node --test tests/unit.test.mjs`): EMI values
  cross-checked against an independent Python calculation (500,000 BDT @
  12.5% reducing / 36 months -> EMI BDT 16,726.81); flat-rate EMI and
  effective rate; offer validation for every field; ranking order and
  savings math; amortization rows summing back to the loan amount; yearly
  roll-up; affordability bands at the 40% / 50% boundaries; import
  validation; i18n key-set completeness (every validation error has an
  EN + BN string).
- **Headless-Chrome smoke - 38/38 pass at 1280px and 38/38 at 390px**
  (`node tests/smoke.mjs`): example offer renders with the correct EMI,
  add / edit / delete flow with live re-ranking, validation rejects bad
  input, 12-month schedule + 3-year roll-up, affordability cards, Bengali
  toggle with Bengali digits, bad-import rejection, typed-DELETE erase,
  persistence across reload, zero console errors, zero page exceptions,
  zero non-file network requests.

## Deployment

Static site - deploy anywhere that serves files. GitHub Pages (main branch,
root) is the configured host:
<https://fahad3235.github.io/loan-compare-bd/>

## Limitations

- **Estimates only, not a bank offer.** Rates and charges change; always
  check the bank's written quote and its full schedule of charges before
  signing. The app ships no real bank rates on purpose.
- EMI math assumes a fixed rate for the whole tenure and equal monthly
  instalments; it does not model floating-rate changes, moratoriums, late
  fees, early-settlement charges or insurance.
- The affordability bands are a rule of thumb, not a lending rule - a bank
  may approve or refuse a loan for many other reasons.
- The example offer on first open is a placeholder: edit it with a real
  quote or delete it.

## Status

Complete MVP, tested and published. See `TEST_RESULTS.md` for the
verification record.
