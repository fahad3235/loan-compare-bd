# TEST_RESULTS - loan-compare-bd (run #318, 18:00 slot, 2026-11-12)

## Unit tests - 16/16 pass
Command: `node --test tests/unit.test.mjs` (Node v24.22.1)
- emiReducing: 500,000 @ 12.5% / 36m = 16,726.81 (cross-checked in Python);
  1,000,000 @ 10% / 12m = 87,915.89; zero rate splits evenly; 1-month case
- emiFlat: 500,000 @ 12% flat / 24m = 25,833.33
- calcOffer reducing: EMI 16,726.81, totals add up (paid = EMI x 36,
  interest = paid - principal, cost = paid + fees), effective rate 12.5%
- calcOffer flat vs reducing at the same headline rate: flat EMI and total
  cost higher; flat 12.5% / 36m effective rate in the 20-25% band
- calcOffer zero rate / zero fees; invalid offers return null
- validateOffer: one error key per field fault (name, type, amount, rate,
  tenure, method, both fees), empty error list for a good offer
- rankOffers: cheapest first, rank numbers, savings vs worst exact,
  invalid offers dropped, empty input safe
- amortization: 36 rows; first-month interest 5,208.33; principal sums to
  500,000 (within 1 BDT of rounding); interest sums to the calc total;
  final balance 0; capped at tenure
- amortization flat: equal interest every month (5,208.33)
- yearlySummary: 3 years, paid/principal sums match the full schedule
- affordability: 40% = ok, just over 40% = caution, over 50% = risky,
  missing income = unknown
- formatBDT: 500,000 -> BDT 5,00,000 (lakh grouping); toBnDigits;
  localizeNumber BN/EN
- validateImport: good backup accepted (incl. empty offers); wrong app,
  version, bad offer, >4 offers, negative income, bad lang all rejected
- data: 5 loan types, example offer valid, storage key correct
- i18n: 102 keys, EN+BN both non-empty, every validateOffer error key has
  an err_ string, fallback returns the key

## Headless-Chrome smoke - 38/38 pass at 1280px AND 38/38 at 390px
Command: `node tests/smoke.mjs 1280` and `node tests/smoke.mjs 390`
(raw CDP against Playwright-cached headless_shell-1187, file:// URL)
- page title, h1, 4 tabs, example offer card with EMI 16,727 and badge
- add Second Bank @ 10%: 2 cards, cheapest ranked #1 with badge, 6-row
  comparison table with 3 columns, localStorage has 2 offers, saves-vs-worst
  shown
- validation: empty name + amount 100 rejected with both error messages,
  no offer added
- edit: form pre-filled, rate changed 10% -> 15%, Example Bank becomes
  cheapest again, still 2 offers
- schedule: 12 rows, first-month interest 5,208, yearly roll-up 3 rows
- affordability: income 50,000 -> 2 cards with % of income
- language: toggle switches title to Bengali, Bengali digits appear,
  toggles back
- data: bad import rejected and offers kept; erase needs exact DELETE;
  DELETE erases and confirms; empty state after erase + reload
- zero console errors, zero page exceptions, zero non-file network requests
- no horizontal overflow on Compare / Schedule / Affordability at both widths

## Repairs made during testing
- None needed in the app: 0 app bugs found. Two test-side fixes only:
  1. Unit-test EMI expectation corrected 16,725.99 -> 16,726.81 (independent
     Python calculation; the app was right, the hand-computed value was not).
  2. Smoke-test edit step targeted the wrong card index (cards are rendered
     in ranked order); changed to select the `.best` card.

## Notes
- No mock data: all math is computed from the user's own inputs; the only
  shipped offer is a labelled example to edit or delete. No real bank rates
  are claimed anywhere (README + in-app disclaimer).
- Sources are pure ASCII (Bengali as \uXXXX escapes via .scratch/gen_i18n.py);
  verified with `grep -P '[^\x00-\x7F]'` - zero matches in js/, index.html,
  styles.css, README.md, tests/.
