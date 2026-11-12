/* Loan Compare BD \u2014 pure calculation + validation logic.
   No DOM, no localStorage here: unit-testable from Node and reusable in the browser.
   Works in Node (module.exports) and in the browser (window.LOAN_CORE). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LOAN_CORE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = {
    amountMin: 10000,
    amountMax: 100000000,
    rateMin: 0,
    rateMax: 40,
    tenureMin: 1,
    tenureMax: 360,
    feeMax: 10000000,
    incomeMin: 0,
    incomeMax: 100000000,
    maxOffers: 4,
  };

  const LOAN_TYPES = ['personal', 'home', 'auto', 'business', 'education'];

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  /* Validate one offer. Returns an array of error keys (empty = valid).
     offer: { name, type, amount, rate, tenureMonths, method, processingFee, otherCharges } */
  function validateOffer(o) {
    const errs = [];
    if (!o || typeof o !== 'object') return ['offerInvalid'];
    if (!o.name || String(o.name).trim().length === 0) errs.push('nameRequired');
    else if (String(o.name).trim().length > 60) errs.push('nameTooLong');
    if (!LOAN_TYPES.includes(o.type)) errs.push('typeInvalid');
    if (!isNum(o.amount)) errs.push('amountRequired');
    else if (o.amount < LIMITS.amountMin) errs.push('amountTooSmall');
    else if (o.amount > LIMITS.amountMax) errs.push('amountTooBig');
    if (!isNum(o.rate)) errs.push('rateRequired');
    else if (o.rate < LIMITS.rateMin) errs.push('rateNegative');
    else if (o.rate > LIMITS.rateMax) errs.push('rateTooHigh');
    if (!isNum(o.tenureMonths) || Math.floor(o.tenureMonths) !== o.tenureMonths) errs.push('tenureRequired');
    else if (o.tenureMonths < LIMITS.tenureMin) errs.push('tenureTooShort');
    else if (o.tenureMonths > LIMITS.tenureMax) errs.push('tenureTooLong');
    if (o.method !== 'reducing' && o.method !== 'flat') errs.push('methodInvalid');
    for (const f of ['processingFee', 'otherCharges']) {
      if (o[f] !== undefined && o[f] !== null && o[f] !== '') {
        if (!isNum(o[f])) errs.push(f + 'Invalid');
        else if (o[f] < 0) errs.push(f + 'Negative');
        else if (o[f] > LIMITS.feeMax) errs.push(f + 'TooBig');
      }
    }
    return errs;
  }

  /* Reducing-balance EMI. rate = annual %; n = months. */
  function emiReducing(principal, annualRate, months) {
    const r = annualRate / 1200; // monthly decimal rate
    if (r === 0) return principal / months;
    const pow = Math.pow(1 + r, months);
    return (principal * r * pow) / (pow - 1);
  }

  /* Flat-rate EMI: interest charged on the full principal for the whole tenure. */
  function emiFlat(principal, annualRate, months) {
    const years = months / 12;
    const totalInterest = principal * (annualRate / 100) * years;
    return (principal + totalInterest) / months;
  }

  /* Full cost breakdown for one offer. Returns null when the offer is invalid. */
  function calcOffer(o) {
    if (validateOffer(o).length > 0) return null;
    const fee = isNum(o.processingFee) ? o.processingFee : 0;
    const other = isNum(o.otherCharges) ? o.otherCharges : 0;
    const emi = o.method === 'flat'
      ? emiFlat(o.amount, o.rate, o.tenureMonths)
      : emiReducing(o.amount, o.rate, o.tenureMonths);
    const totalPaidToBank = emi * o.tenureMonths;
    const totalInterest = totalPaidToBank - o.amount;
    const totalCost = totalPaidToBank + fee + other; // everything the borrower pays
    const effectiveAnnual = o.method === 'flat'
      ? flatEffectiveRate(o.amount, o.rate, o.tenureMonths)
      : o.rate;
    return {
      emi: round2(emi),
      totalInterest: round2(totalInterest),
      totalPaidToBank: round2(totalPaidToBank),
      processingFee: round2(fee),
      otherCharges: round2(other),
      totalCost: round2(totalCost),
      effectiveAnnualRate: round2(effectiveAnnual),
      monthlyRate: round2(o.rate / 12),
    };
  }

  /* Approximate effective annual rate of a flat-rate loan: solve for the
     reducing rate whose EMI matches the flat EMI (bisection, 60 iterations). */
  function flatEffectiveRate(principal, flatRate, months) {
    const target = emiFlat(principal, flatRate, months);
    let lo = 0, hi = 100; // annual % bounds
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (emiReducing(principal, mid, months) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* Rank offers cheapest-first by totalCost. Returns a new array of
     { offer, calc, rank, savesVsWorst } (savesVsWorst = 0 for the worst). */
  function rankOffers(offers) {
    const scored = offers.map((o) => ({ offer: o, calc: calcOffer(o) }))
      .filter((s) => s.calc !== null);
    scored.sort((a, b) => a.calc.totalCost - b.calc.totalCost);
    const worst = scored.length ? scored[scored.length - 1].calc.totalCost : 0;
    return scored.map((s, i) => ({
      offer: s.offer,
      calc: s.calc,
      rank: i + 1,
      savesVsWorst: round2(worst - s.calc.totalCost),
    }));
  }

  /* Amortization schedule (reducing method; for flat loans the split is
     interest = totalInterest / n each month, principal = EMI - interest).
     Returns up to `months` rows: { month, emi, interest, principal, balance }. */
  function amortization(o, months) {
    const calc = calcOffer(o);
    if (!calc) return null;
    const n = Math.min(months || o.tenureMonths, o.tenureMonths);
    const rows = [];
    let balance = o.amount;
    const r = o.rate / 1200;
    for (let m = 1; m <= n; m++) {
      let interest, principal;
      if (o.method === 'flat') {
        interest = calc.totalInterest / o.tenureMonths;
        principal = calc.emi - interest;
      } else {
        interest = balance * r;
        principal = calc.emi - interest;
      }
      if (m === o.tenureMonths) { // last row clears rounding dust
        principal = balance;
      }
      balance = Math.max(0, balance - principal);
      rows.push({
        month: m,
        emi: round2(calc.emi),
        interest: round2(interest),
        principal: round2(principal),
        balance: round2(balance),
      });
    }
    return rows;
  }

  /* Yearly roll-up of a full schedule: [{ year, interest, principal, paid }]. */
  function yearlySummary(o) {
    const full = amortization(o, o.tenureMonths);
    if (!full) return null;
    const years = [];
    for (const row of full) {
      const y = Math.ceil(row.month / 12) - 1;
      if (!years[y]) years[y] = { year: y + 1, interest: 0, principal: 0, paid: 0 };
      years[y].interest += row.interest;
      years[y].principal += row.principal;
      years[y].paid += row.emi;
    }
    return years.map((y) => ({
      year: y.year,
      interest: round2(y.interest),
      principal: round2(y.principal),
      paid: round2(y.paid),
    }));
  }

  /* Affordability of an EMI against monthly income.
     Bands follow the common 40% rule of thumb (labelled as such in the UI):
     ok <= 40%, caution 40\u201350%, risky > 50%. */
  function affordability(emi, income) {
    if (!isNum(emi) || emi < 0) return { band: 'unknown', ratio: null };
    if (!isNum(income) || income <= 0) return { band: 'unknown', ratio: null };
    const ratio = (emi / income) * 100;
    let band = 'ok';
    if (ratio > 50) band = 'risky';
    else if (ratio > 40) band = 'caution';
    return { band, ratio: round2(ratio) };
  }

  /* Format a BDT amount with lakh-style grouping (en-IN) and 0 decimals. */
  function formatBDT(n) {
    if (!isNum(n)) return '\u2014';
    return '\u09f3' + Math.round(n).toLocaleString('en-IN');
  }

  /* Convert ASCII digits 0-9 in a string to Bengali digits. */
  function toBnDigits(s) {
    const map = { 0: '\u09e6', 1: '\u09e7', 2: '\u09e8', 3: '\u09e9', 4: '\u09ea', 5: '\u09eb', 6: '\u09ec', 7: '\u09ed', 8: '\u09ee', 9: '\u09ef' };
    return String(s).replace(/[0-9]/g, (d) => map[d]);
  }

  /* Localise a display string: in BN mode, digits become Bengali digits. */
  function localizeNumber(s, lang) {
    return lang === 'bn' ? toBnDigits(s) : String(s);
  }

  /* Validate an exported/imported backup object. */
  function validateImport(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.app !== 'loan-compare-bd') return false;
    if (typeof obj.version !== 'number' || obj.version !== 1) return false;
    if (!Array.isArray(obj.offers)) return false;
    if (obj.offers.length > LIMITS.maxOffers) return false;
    for (const o of obj.offers) {
      if (validateOffer(o).length > 0) return false;
    }
    if (obj.income !== undefined && obj.income !== null) {
      if (!isNum(obj.income) || obj.income < 0 || obj.income > LIMITS.incomeMax) return false;
    }
    if (obj.lang !== undefined && obj.lang !== 'en' && obj.lang !== 'bn') return false;
    return true;
  }

  return {
    LIMITS, LOAN_TYPES, round2, validateOffer, emiReducing, emiFlat,
    flatEffectiveRate, calcOffer, rankOffers, amortization, yearlySummary,
    affordability, formatBDT, toBnDigits, localizeNumber, validateImport,
  };
});
