/* Loan Compare BD \u2014 node unit tests. Run: node --test tests/unit.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const DATA = require('../js/data.js');
const I18N = require('../js/i18n.js');

const good = {
  name: 'Test Bank - Personal',
  type: 'personal',
  amount: 500000,
  rate: 12.5,
  tenureMonths: 36,
  method: 'reducing',
  processingFee: 5000,
  otherCharges: 0,
};

test('emiReducing: known values (cross-checked in Python)', () => {
  // 500,000 @ 12.5% / 36 months -> EMI 16726.81 (Python: round to 2dp)
  assert.equal(Core.round2(Core.emiReducing(500000, 12.5, 36)), 16726.81);
  // 1,000,000 @ 10% / 12 months -> 87915.89
  assert.equal(Core.round2(Core.emiReducing(1000000, 10, 12)), 87915.89);
  // zero rate -> straight split
  assert.equal(Core.emiReducing(120000, 0, 12), 10000);
  // 1 month -> principal + one month interest
  assert.equal(Core.round2(Core.emiReducing(100000, 12, 1)), 101000);
});

test('emiFlat: interest on the full principal', () => {
  // 500,000 @ 12% flat / 24 months: interest 120,000 -> EMI 25,833.33
  assert.equal(Core.round2(Core.emiFlat(500000, 12, 24)), 25833.33);
  assert.equal(Core.emiFlat(120000, 0, 12), 10000);
});

test('calcOffer: reducing breakdown adds up', () => {
  const c = Core.calcOffer(good);
  assert.equal(c.emi, 16726.81);
  assert.equal(c.totalPaidToBank, Core.round2(Core.emiReducing(500000, 12.5, 36) * 36));
  assert.equal(c.totalInterest, Core.round2(c.totalPaidToBank - 500000));
  assert.equal(c.totalCost, Core.round2(c.totalPaidToBank + 5000));
  assert.equal(c.effectiveAnnualRate, 12.5);
  assert.equal(c.processingFee, 5000);
});

test('calcOffer: flat loan costs more than reducing at the same headline rate', () => {
  const flat = Core.calcOffer({ ...good, method: 'flat' });
  const red = Core.calcOffer(good);
  assert.ok(flat.emi > red.emi, 'flat EMI higher');
  assert.ok(flat.totalCost > red.totalCost, 'flat total cost higher');
  // flat 12.5% / 36m has an effective reducing rate near 22-23%
  assert.ok(flat.effectiveAnnualRate > 20 && flat.effectiveAnnualRate < 25,
    'effective rate ' + flat.effectiveAnnualRate);
});

test('calcOffer: zero rate and zero fees', () => {
  const c = Core.calcOffer({ ...good, rate: 0, processingFee: 0 });
  assert.equal(c.emi, Core.round2(500000 / 36));
  assert.equal(c.totalInterest, 0);
  assert.equal(c.totalCost, 500000);
});

test('calcOffer: invalid offer returns null', () => {
  assert.equal(Core.calcOffer({ ...good, amount: 100 }), null);
  assert.equal(Core.calcOffer({ ...good, rate: 99 }), null);
  assert.equal(Core.calcOffer({ ...good, tenureMonths: 0 }), null);
  assert.equal(Core.calcOffer({ ...good, method: 'daily' }), null);
  assert.equal(Core.calcOffer(null), null);
});

test('validateOffer: every field, one error key each', () => {
  assert.deepEqual(Core.validateOffer({ ...good, name: '' }), ['nameRequired']);
  assert.deepEqual(Core.validateOffer({ ...good, name: 'x'.repeat(61) }), ['nameTooLong']);
  assert.deepEqual(Core.validateOffer({ ...good, type: 'gold' }), ['typeInvalid']);
  assert.deepEqual(Core.validateOffer({ ...good, amount: null }), ['amountRequired']);
  assert.deepEqual(Core.validateOffer({ ...good, amount: 9999 }), ['amountTooSmall']);
  assert.deepEqual(Core.validateOffer({ ...good, amount: 100000001 }), ['amountTooBig']);
  assert.deepEqual(Core.validateOffer({ ...good, rate: null }), ['rateRequired']);
  assert.deepEqual(Core.validateOffer({ ...good, rate: -1 }), ['rateNegative']);
  assert.deepEqual(Core.validateOffer({ ...good, rate: 41 }), ['rateTooHigh']);
  assert.deepEqual(Core.validateOffer({ ...good, tenureMonths: 1.5 }), ['tenureRequired']);
  assert.deepEqual(Core.validateOffer({ ...good, tenureMonths: 0 }), ['tenureTooShort']);
  assert.deepEqual(Core.validateOffer({ ...good, tenureMonths: 361 }), ['tenureTooLong']);
  assert.deepEqual(Core.validateOffer({ ...good, method: 'x' }), ['methodInvalid']);
  assert.deepEqual(Core.validateOffer({ ...good, processingFee: -5 }), ['processingFeeNegative']);
  assert.deepEqual(Core.validateOffer({ ...good, otherCharges: 'abc' }), ['otherChargesInvalid']);
  assert.deepEqual(Core.validateOffer(good), []);
  assert.deepEqual(Core.validateOffer({ ...good, processingFee: undefined, otherCharges: undefined }), []);
});

test('rankOffers: cheapest first, savings vs worst', () => {
  const cheap = { ...good, name: 'Cheap', rate: 10 };
  const mid = { ...good, name: 'Mid', rate: 12.5 };
  const dear = { ...good, name: 'Dear', rate: 15 };
  const ranked = Core.rankOffers([dear, cheap, mid]);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].offer.name, 'Cheap');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[2].offer.name, 'Dear');
  assert.equal(ranked[2].savesVsWorst, 0);
  assert.ok(ranked[0].savesVsWorst > 0);
  assert.equal(ranked[0].savesVsWorst,
    Core.round2(ranked[2].calc.totalCost - ranked[0].calc.totalCost));
  // invalid offers are dropped, not ranked
  assert.equal(Core.rankOffers([cheap, { ...good, rate: 99 }]).length, 1);
  assert.deepEqual(Core.rankOffers([]), []);
});

test('amortization: reducing schedule sums back to the loan', () => {
  const rows = Core.amortization(good, 36);
  assert.equal(rows.length, 36);
  assert.equal(rows[0].month, 1);
  // first month interest = 500,000 * 12.5% / 12 = 5208.33
  assert.equal(rows[0].interest, 5208.33);
  assert.equal(rows[0].principal, Core.round2(16726.81 - 5208.33));
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  assert.ok(Math.abs(totalPrincipal - 500000) < 1, 'principal sums to amount: ' + totalPrincipal);
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  assert.ok(Math.abs(totalInterest - Core.calcOffer(good).totalInterest) < 1,
    'interest sums to total: ' + totalInterest);
  assert.equal(rows[35].balance, 0);
  // capped at tenure
  assert.equal(Core.amortization(good, 99).length, 36);
  assert.equal(Core.amortization({ ...good, rate: 99 }, 12), null);
});

test('amortization: flat schedule has equal interest every month', () => {
  const rows = Core.amortization({ ...good, method: 'flat' }, 36);
  assert.equal(rows.length, 36);
  assert.ok(rows.every((r) => r.interest === rows[0].interest));
  assert.equal(rows[0].interest, Core.round2((500000 * 0.125 * 3) / 36));
});

test('yearlySummary: 3 years, sums match the full schedule', () => {
  const years = Core.yearlySummary(good);
  assert.equal(years.length, 3);
  assert.deepEqual(years.map((y) => y.year), [1, 2, 3]);
  const totalPaid = years.reduce((s, y) => s + y.paid, 0);
  assert.ok(Math.abs(totalPaid - Core.calcOffer(good).totalPaidToBank) < 1);
  const totalPrincipal = years.reduce((s, y) => s + y.principal, 0);
  assert.ok(Math.abs(totalPrincipal - 500000) < 1);
  assert.equal(Core.yearlySummary({ ...good, rate: 99 }), null);
});

test('affordability: 40% / 50% bands', () => {
  assert.deepEqual(Core.affordability(20000, 50000), { band: 'ok', ratio: 40 });
  assert.deepEqual(Core.affordability(20001, 50000), { band: 'caution', ratio: 40 });
  assert.equal(Core.affordability(22500, 50000).band, 'caution');
  assert.equal(Core.affordability(25000, 50000).band, 'caution');
  assert.equal(Core.affordability(25001, 50000).band, 'risky');
  assert.deepEqual(Core.affordability(10000, 0), { band: 'unknown', ratio: null });
  assert.deepEqual(Core.affordability(10000, null), { band: 'unknown', ratio: null });
});

test('formatBDT + toBnDigits + localizeNumber', () => {
  assert.equal(Core.formatBDT(500000), '\u09f35,00,000');
  assert.equal(Core.formatBDT(16726.81), '\u09f316,727');
  assert.equal(Core.formatBDT('x'), '\u2014');
  assert.equal(Core.toBnDigits('2026-11-12'), '\u09e8\u09e6\u09e8\u09ec-\u09e7\u09e7-\u09e7\u09e8');
  assert.equal(Core.localizeNumber('12.5%', 'bn'), '\u09e7\u09e8.\u09eb%');
  assert.equal(Core.localizeNumber('12.5%', 'en'), '12.5%');
});

test('validateImport: accepts good backups, rejects everything else', () => {
  const ok = { app: 'loan-compare-bd', version: 1, offers: [good], income: 60000, lang: 'bn' };
  assert.equal(Core.validateImport(ok), true);
  assert.equal(Core.validateImport({ ...ok, offers: [] }), true);
  assert.equal(Core.validateImport({ ...ok, income: undefined }), true);
  assert.equal(Core.validateImport(null), false);
  assert.equal(Core.validateImport({ ...ok, app: 'other-app' }), false);
  assert.equal(Core.validateImport({ ...ok, version: 2 }), false);
  assert.equal(Core.validateImport({ ...ok, offers: [{ ...good, rate: 99 }] }), false);
  assert.equal(Core.validateImport({ ...ok, offers: [good, good, good, good, good] }), false);
  assert.equal(Core.validateImport({ ...ok, income: -1 }), false);
  assert.equal(Core.validateImport({ ...ok, lang: 'fr' }), false);
});

test('data: example offer is valid, 5 loan types', () => {
  assert.equal(DATA.LOAN_TYPES.length, 5);
  assert.deepEqual(Core.validateOffer(DATA.EXAMPLE_OFFER), []);
  assert.equal(DATA.EXAMPLE_OFFER.isExample, true);
  assert.equal(DATA.STORAGE_KEY, 'loan-compare-bd-v1');
});

test('i18n: EN and BN sets identical, all non-empty, no missing err keys', () => {
  const keys = I18N.keys();
  assert.ok(keys.length >= 90, 'keys: ' + keys.length);
  for (const k of keys) {
    const pair = I18N.STRINGS[k];
    assert.ok(pair[0] && pair[0].length > 0, k + ' EN empty');
    assert.ok(pair[1] && pair[1].length > 0, k + ' BN empty');
  }
  // every validateOffer error key has an i18n string
  const errKeys = ['offerInvalid', 'nameRequired', 'nameTooLong', 'typeInvalid',
    'amountRequired', 'amountTooSmall', 'amountTooBig', 'rateRequired', 'rateNegative',
    'rateTooHigh', 'tenureRequired', 'tenureTooShort', 'tenureTooLong', 'methodInvalid',
    'processingFeeInvalid', 'processingFeeNegative', 'processingFeeTooBig',
    'otherChargesInvalid', 'otherChargesNegative', 'otherChargesTooBig'];
  for (const k of errKeys) assert.ok(I18N.STRINGS['err_' + k], 'missing err_' + k);
  assert.equal(I18N.t('appTitle', 'en'), 'Loan Compare BD');
  assert.equal(I18N.t('appTitle', 'bn'), '\u09b2\u09cb\u09a8 \u0995\u09ae\u09aa\u09c7\u09af\u09bc\u09be\u09b0 \u09ac\u09bf\u09a1\u09bf');
  assert.equal(I18N.t('no-such-key', 'en'), 'no-such-key');
});
