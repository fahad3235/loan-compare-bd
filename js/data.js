/* Loan Compare BD \u2014 data: loan types + one clearly-labelled example offer.
   No real bank rates are shipped: rates change constantly, so every offer is
   entered by the user from the bank's own quote. The example is a placeholder
   the user edits or deletes. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LOAN_DATA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LOAN_TYPES = [
    { id: 'personal', en: 'Personal loan' },
    { id: 'home', en: 'Home loan' },
    { id: 'auto', en: 'Auto / car loan' },
    { id: 'business', en: 'Business loan' },
    { id: 'education', en: 'Education loan' },
  ];

  /* One example offer so the comparison table is not empty on first open.
     It is marked isExample and the UI labels it as an example to edit/delete. */
  var EXAMPLE_OFFER = {
    id: 'example-1',
    name: 'Example Bank - Personal',
    type: 'personal',
    amount: 500000,
    rate: 12.5,
    tenureMonths: 36,
    method: 'reducing',
    processingFee: 5000,
    otherCharges: 0,
    isExample: true,
  };

  var STORAGE_KEY = 'loan-compare-bd-v1';
  var APP_VERSION = 1;

  return { LOAN_TYPES, EXAMPLE_OFFER, STORAGE_KEY, APP_VERSION };
});
