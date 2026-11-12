/* Loan Compare BD \u2014 UI. Depends on window.LOAN_CORE, window.LOAN_DATA, window.LOAN_I18N.
   State (localStorage, key loan-compare-bd-v1): { offers, income, lang }. */
(function () {
  'use strict';

  var Core = window.LOAN_CORE;
  var DATA = window.LOAN_DATA;
  var I18N = window.LOAN_I18N;
  var KEY = DATA.STORAGE_KEY;

  var state = loadState();
  var editingId = null;

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.offers)) {
          return {
            offers: parsed.offers,
            income: parsed.income != null ? parsed.income : null,
            lang: parsed.lang === 'bn' ? 'bn' : 'en',
          };
        }
      }
    } catch (e) { /* corrupted storage: fall through to defaults */ }
    return { offers: [JSON.parse(JSON.stringify(DATA.EXAMPLE_OFFER))], income: null, lang: 'en' };
  }

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }

  function t(key) { return I18N.t(key, state.lang); }
  function num(n) { return Core.localizeNumber(String(n), state.lang); }
  function money(n) { return Core.localizeNumber(Core.formatBDT(n), state.lang); }
  function pct(n) { return num(n.toFixed(2).replace(/\.?0+$/, '')) + '%'; }
  function typeLabel(id) { return t('type_' + id); }

  function el(id) { return document.getElementById(id); }
  function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('hidden', p.id !== 'tab-' + name);
    });
    if (name === 'schedule') renderSchedule();
    if (name === 'afford') renderAfford();
  }

  /* ---------- static labels ---------- */
  function applyStaticLabels() {
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (node) {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-ph')));
    });
    el('lang-toggle').textContent = state.lang === 'bn' ? 'English' : '\u09ac\u09be\u0982\u09b2\u09be';
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    el('form-title').textContent = t(editingId ? 'formTitleEdit' : 'formTitle');
    el('offer-submit').textContent = t(editingId ? 'updateBtn' : 'addBtn');
    el('offer-cancel').classList.toggle('hidden', !editingId);
  }

  /* ---------- compare tab ---------- */
  function readForm() {
    var feeRaw = el('f-fee').value.trim();
    var otherRaw = el('f-other').value.trim();
    return {
      name: el('f-name').value.trim(),
      type: el('f-type').value,
      amount: numOrNull(el('f-amount').value),
      rate: numOrNull(el('f-rate').value),
      tenureMonths: intOrNull(el('f-tenure').value),
      method: document.querySelector('input[name="f-method"]:checked').value,
      processingFee: feeRaw === '' ? 0 : numOrNull(feeRaw),
      otherCharges: otherRaw === '' ? 0 : numOrNull(otherRaw),
    };
  }

  function numOrNull(v) {
    var n = parseFloat(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }
  function intOrNull(v) {
    var n = parseInt(String(v).replace(/,/g, '').trim(), 10);
    return isFinite(n) ? n : null;
  }

  function submitOffer(ev) {
    ev.preventDefault();
    var offer = readForm();
    var errs = Core.validateOffer(offer);
    var box = el('form-errors');
    if (errs.length > 0) {
      box.innerHTML = '';
      var ul = document.createElement('ul');
      errs.forEach(function (k) {
        var li = document.createElement('li');
        li.textContent = t('err_' + k);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      el('form-msg').textContent = '';
      return;
    }
    if (editingId) {
      var idx = state.offers.findIndex(function (o) { return o.id === editingId; });
      if (idx >= 0) {
        offer.id = editingId;
        offer.isExample = !!state.offers[idx].isExample;
        state.offers[idx] = offer;
      }
      editingId = null;
      el('form-msg').textContent = t('offerUpdated');
    } else {
      if (state.offers.length >= Core.LIMITS.maxOffers) {
        box.innerHTML = '';
        var li = document.createElement('li');
        li.textContent = t('maxOffers');
        box.appendChild(li);
        return;
      }
      offer.id = 'offer-' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
      state.offers.push(offer);
      el('form-msg').textContent = t('offerAdded');
    }
    saveState();
    clearForm();
    renderAll();
  }

  function clearForm() {
    el('offer-form').reset();
    el('f-type').value = 'personal';
    document.querySelector('input[name="f-method"][value="reducing"]').checked = true;
    el('form-errors').innerHTML = '';
    editingId = null;
    applyStaticLabels();
  }

  function editOffer(id) {
    var o = state.offers.find(function (x) { return x.id === id; });
    if (!o) return;
    editingId = id;
    el('f-name').value = o.name;
    el('f-type').value = o.type;
    el('f-amount').value = o.amount;
    el('f-rate').value = o.rate;
    el('f-tenure').value = o.tenureMonths;
    document.querySelector('input[name="f-method"][value="' + o.method + '"]').checked = true;
    el('f-fee').value = o.processingFee || '';
    el('f-other').value = o.otherCharges || '';
    el('form-errors').innerHTML = '';
    el('form-msg').textContent = '';
    applyStaticLabels();
    el('offer-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deleteOffer(id) {
    state.offers = state.offers.filter(function (o) { return o.id !== id; });
    if (editingId === id) { editingId = null; clearForm(); }
    saveState();
    el('form-msg').textContent = t('offerDeleted');
    renderAll();
  }

  function renderOffers() {
    var list = el('offers-list');
    list.innerHTML = '';
    if (state.offers.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('emptyOffers');
      list.appendChild(p);
      return;
    }
    var ranked = Core.rankOffers(state.offers);
    ranked.forEach(function (r) {
      var card = document.createElement('article');
      card.className = 'offer-card' + (r.rank === 1 ? ' best' : '');
      var h = document.createElement('h3');
      h.textContent = r.offer.name;
      card.appendChild(h);
      var meta = document.createElement('p');
      meta.className = 'offer-meta';
      meta.textContent = typeLabel(r.offer.type) + ' \u00b7 ' + money(r.offer.amount) + ' \u00b7 ' +
        num(r.offer.rate) + '% \u00b7 ' + num(r.offer.tenureMonths) + ' ' + t('monthsUnit') +
        ' \u00b7 ' + (r.offer.method === 'flat' ? t('methodFlat').split(' (')[0] : t('methodReducing').split(' (')[0]);
      card.appendChild(meta);
      if (r.offer.isExample) {
        var ex = document.createElement('span');
        ex.className = 'badge example';
        ex.textContent = t('exampleBadge');
        card.appendChild(ex);
      }
      if (r.rank === 1 && ranked.length > 1) {
        var best = document.createElement('span');
        best.className = 'badge best';
        best.textContent = '#' + num(1) + ' ' + t('rankBest');
        card.appendChild(best);
      }
      var dl = document.createElement('dl');
      dl.className = 'offer-nums';
      var rows = [
        [t('emiLabel'), money(r.calc.emi) + t('perMonth')],
        [t('totalInterest'), money(r.calc.totalInterest)],
        [t('totalCost'), money(r.calc.totalCost)],
      ];
      if (r.savesVsWorst > 0) rows.push([t('savesVsWorst'), money(r.savesVsWorst)]);
      rows.forEach(function (row) {
        var dt = document.createElement('dt'); dt.textContent = row[0];
        var dd = document.createElement('dd'); dd.textContent = row[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      card.appendChild(dl);
      var actions = document.createElement('div');
      actions.className = 'card-actions';
      var eb = document.createElement('button');
      eb.type = 'button'; eb.className = 'btn small'; eb.textContent = t('editBtn');
      eb.addEventListener('click', function () { editOffer(r.offer.id); });
      var db = document.createElement('button');
      db.type = 'button'; db.className = 'btn small danger'; db.textContent = t('deleteBtn');
      db.addEventListener('click', function () { deleteOffer(r.offer.id); });
      actions.appendChild(eb); actions.appendChild(db);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function renderCompareTable() {
    var wrap = el('compare-table-wrap');
    wrap.innerHTML = '';
    if (state.offers.length < 2) return;
    var ranked = Core.rankOffers(state.offers);
    var table = document.createElement('table');
    table.className = 'compare-table';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    var th0 = document.createElement('th'); th0.textContent = t('metricLabel');
    hr.appendChild(th0);
    ranked.forEach(function (r) {
      var th = document.createElement('th');
      th.textContent = (r.rank === 1 ? '#1 ' : '#' + num(r.rank) + ' ') + r.offer.name;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    var metrics = [
      [t('emiLabel'), function (c) { return money(c.emi) + t('perMonth'); }],
      [t('totalInterest'), function (c) { return money(c.totalInterest); }],
      [t('totalPayable'), function (c) { return money(c.totalPaidToBank); }],
      [t('feesLabel'), function (c) { return money(c.processingFee + c.otherCharges); }],
      [t('totalCost'), function (c) { return money(c.totalCost); }],
      [t('effRate'), function (c) { return num(c.effectiveAnnualRate) + '%'; }],
    ];
    metrics.forEach(function (m) {
      var tr = document.createElement('tr');
      var td0 = document.createElement('td'); td0.textContent = m[0];
      tr.appendChild(td0);
      ranked.forEach(function (r) {
        var td = document.createElement('td');
        td.textContent = m[1](r.calc);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  /* ---------- schedule tab ---------- */
  function renderSchedule() {
    var pick = el('schedule-pick');
    var current = pick.value;
    pick.innerHTML = '';
    state.offers.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      pick.appendChild(opt);
    });
    if (state.offers.length === 0) {
      el('schedule-empty').classList.remove('hidden');
      el('schedule-content').classList.add('hidden');
      return;
    }
    el('schedule-empty').classList.add('hidden');
    el('schedule-content').classList.remove('hidden');
    if (!state.offers.some(function (o) { return o.id === current; })) current = state.offers[0].id;
    pick.value = current;
    var offer = state.offers.find(function (o) { return o.id === current; });
    var calc = Core.calcOffer(offer);
    el('schedule-note').textContent = offer.method === 'flat' ? t('scheduleNoteFlat') : '';
    var rows = Core.amortization(offer, 12);
    var tbody = el('schedule-body');
    tbody.innerHTML = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      [row.month, row.interest, row.principal, row.balance].forEach(function (v, i) {
        var td = document.createElement('td');
        td.textContent = i === 0 ? num(v) : money(v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    var years = Core.yearlySummary(offer);
    var yb = el('yearly-body');
    yb.innerHTML = '';
    years.forEach(function (y) {
      var tr = document.createElement('tr');
      [y.year, y.interest, y.principal, y.paid].forEach(function (v, i) {
        var td = document.createElement('td');
        td.textContent = i === 0 ? num(v) : money(v);
        tr.appendChild(td);
      });
      yb.appendChild(tr);
    });
    el('schedule-summary').textContent =
      t('emiLabel') + ': ' + money(calc.emi) + t('perMonth') + ' \u00b7 ' +
      t('totalInterest') + ': ' + money(calc.totalInterest) + ' \u00b7 ' +
      t('totalCost') + ': ' + money(calc.totalCost);
  }

  /* ---------- affordability tab ---------- */
  function renderAfford() {
    var income = state.income;
    el('income-input').value = income != null ? income : '';
    var list = el('afford-list');
    list.innerHTML = '';
    if (income == null || income <= 0) {
      el('afford-empty').classList.remove('hidden');
      return;
    }
    el('afford-empty').classList.add('hidden');
    var ranked = Core.rankOffers(state.offers);
    if (ranked.length === 0) {
      el('afford-empty').classList.remove('hidden');
      return;
    }
    ranked.forEach(function (r) {
      var a = Core.affordability(r.calc.emi, income);
      var card = document.createElement('article');
      card.className = 'afford-card band-' + a.band;
      var h = document.createElement('h3');
      h.textContent = r.offer.name;
      card.appendChild(h);
      var p = document.createElement('p');
      p.textContent = t('emiLabel') + ': ' + money(r.calc.emi) + t('perMonth') + ' \u2014 ' +
        num(a.ratio) + '% ' + t('ofIncome');
      card.appendChild(p);
      var badge = document.createElement('span');
      badge.className = 'badge band';
      badge.textContent = t('band' + a.band.charAt(0).toUpperCase() + a.band.slice(1));
      card.appendChild(badge);
      list.appendChild(card);
    });
  }

  /* ---------- data tab ---------- */
  function exportData() {
    var payload = { app: 'loan-compare-bd', version: DATA.APP_VERSION, offers: state.offers, income: state.income, lang: state.lang };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'loan-compare-bd-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function importData() {
    var msg = el('data-msg');
    try {
      var obj = JSON.parse(el('import-text').value);
      if (!Core.validateImport(obj)) { msg.textContent = t('importBad'); return; }
      state.offers = obj.offers;
      state.income = obj.income != null ? obj.income : null;
      if (obj.lang === 'en' || obj.lang === 'bn') state.lang = obj.lang;
      editingId = null;
      saveState();
      clearForm();
      renderAll();
      msg.textContent = t('importOk');
    } catch (e) {
      msg.textContent = t('importBad');
    }
  }

  function eraseData() {
    var msg = el('data-msg');
    if (el('erase-input').value !== 'DELETE') { msg.textContent = t('eraseWrong'); return; }
    state = { offers: [], income: null, lang: state.lang };
    editingId = null;
    saveState();
    clearForm();
    renderAll();
    el('erase-input').value = '';
    msg.textContent = t('eraseDone');
  }

  function renderAll() {
    applyStaticLabels();
    renderOffers();
    renderCompareTable();
    renderSchedule();
    renderAfford();
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });
  el('lang-toggle').addEventListener('click', function () {
    state.lang = state.lang === 'bn' ? 'en' : 'bn';
    saveState();
    renderAll();
  });
  el('offer-form').addEventListener('submit', submitOffer);
  el('offer-cancel').addEventListener('click', function () { clearForm(); renderAll(); });
  el('schedule-pick').addEventListener('change', renderSchedule);
  el('income-input').addEventListener('input', function () {
    var v = numOrNull(el('income-input').value);
    state.income = v != null && v > 0 ? v : null;
    saveState();
    renderAfford();
  });
  el('export-btn').addEventListener('click', exportData);
  el('import-btn').addEventListener('click', importData);
  el('erase-btn').addEventListener('click', eraseData);

  renderAll();

  /* Exposed for smoke tests. */
  window.LOAN_APP = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getRanked: function () { return Core.rankOffers(state.offers); },
  };
})();
