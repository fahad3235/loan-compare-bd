/* Loan Compare BD \u2014 headless-Chrome smoke tests via raw CDP (no deps).
   Run: node tests/smoke.mjs [width]   (default 1280; pass 390 for mobile)
   Uses the Playwright-cached headless_shell. Serves the app over file:// */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell');
const WIDTH = parseInt(process.argv[2] || '1280', 10);
const HEIGHT = 900;
const PORT = 9334;

let failures = [];
let checks = 0;
function check(name, cond, extra = '') {
  checks++;
  if (cond) console.log('  PASS ' + name);
  else { failures.push(name + (extra ? ' \u2014 ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' \u2014 ' + extra : '')); }
}

const chrome = spawn(SHELL, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      return j.webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('CDP did not start');
}

async function main() {
  const browserWs = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { browserWs.onopen = res; browserWs.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  const events = [];
  browserWs.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    browserWs.send(JSON.stringify({ id, method, params }));
  });

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.result.targetId;
  const attached = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  const sendS = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    browserWs.send(JSON.stringify({ id, sessionId, method, params }));
  });

  await sendS('Runtime.enable');
  await sendS('Page.enable');
  await sendS('Network.enable');
  await sendS('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 500 });

  const consoleErrors = [];
  const pageErrors = [];
  const extRequests = [];
  const origOnMessage = browserWs.onmessage;
  browserWs.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
    }
    if (m.sessionId === sessionId && m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (m.sessionId === sessionId && m.method === 'Network.requestWillBeSent') {
      const url = m.params.request.url;
      if (!url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('chrome')) {
        extRequests.push(url);
      }
    }
    origOnMessage(ev);
  };

  const evalJs = async (expr) => {
    const r = await sendS('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  const fileUrl = 'file://' + path.join(ROOT, 'index.html');
  await sendS('Page.navigate', { url: fileUrl });
  await sleep(1200);

  console.log(`== smoke @ ${WIDTH}px ==`);

  check('page title', (await evalJs('document.title')).includes('Loan Compare BD'));
  check('h1 renders', (await evalJs(`document.getElementById('app-title').textContent`)) === 'Loan Compare BD');
  check('4 tabs present', (await evalJs(`document.querySelectorAll('.tab-btn').length`)) === 4);
  check('example offer card renders', (await evalJs(`document.querySelectorAll('.offer-card').length`)) === 1);
  check('example EMI shown (16,727)', (await evalJs(`document.querySelector('.offer-card').textContent`)).includes('16,727'),
    await evalJs(`document.querySelector('.offer-card').textContent`));
  check('example badge shown', (await evalJs(`document.querySelector('.offer-card').textContent`)).includes('Example'));
  check('no horizontal overflow (compare)', (await evalJs('document.documentElement.scrollWidth')) <= WIDTH + 1,
    'scrollWidth=' + (await evalJs('document.documentElement.scrollWidth')));

  // --- add a second, cheaper offer; ranking must put it first ---
  await evalJs(`(function(){
    document.getElementById('f-name').value = 'Second Bank - Personal';
    document.getElementById('f-type').value = 'personal';
    document.getElementById('f-amount').value = '500000';
    document.getElementById('f-rate').value = '10';
    document.getElementById('f-tenure').value = '36';
    document.getElementById('f-fee').value = '2000';
    document.getElementById('f-other').value = '';
    document.getElementById('offer-submit').click();
  })()`);
  await sleep(250);
  check('second offer added', (await evalJs(`document.querySelectorAll('.offer-card').length`)) === 2);
  check('cheapest offer ranked #1 with badge', (await evalJs(`document.querySelectorAll('.offer-card.best').length`)) === 1);
  check('best card is Second Bank', (await evalJs(`document.querySelector('.offer-card.best h3').textContent`)) === 'Second Bank - Personal');
  check('comparison table renders (6 metric rows)', (await evalJs(`document.querySelectorAll('#compare-table-wrap tbody tr').length`)) === 6);
  check('comparison table has 3 columns', (await evalJs(`document.querySelectorAll('#compare-table-wrap thead th').length`)) === 3);
  check('state persisted to localStorage', (await evalJs(`JSON.parse(localStorage.getItem('loan-compare-bd-v1')).offers.length`)) === 2);
  check('saves-vs-worst shown on best card', (await evalJs(`document.querySelector('.offer-card.best').textContent`)).includes('saves vs most expensive'));

  // --- validation: empty name + tiny amount rejected ---
  await evalJs(`(function(){
    document.getElementById('f-name').value = '';
    document.getElementById('f-amount').value = '100';
    document.getElementById('offer-submit').click();
  })()`);
  await sleep(200);
  const formErrs = await evalJs(`document.getElementById('form-errors').textContent`);
  check('validation errors shown', formErrs.includes('name') && formErrs.includes('10,000'), formErrs);
  check('invalid offer not added', (await evalJs(`document.querySelectorAll('.offer-card').length`)) === 2);

  // --- edit flow: edit Second Bank rate to 15 -> example becomes cheapest ---
  await evalJs(`(function(){
    document.querySelector('.offer-card.best').querySelectorAll('button')[0].click();
  })()`);
  await sleep(200);
  check('edit fills the form', (await evalJs(`document.getElementById('f-name').value`)) === 'Second Bank - Personal');
  await evalJs(`(function(){
    document.getElementById('f-rate').value = '15';
    document.getElementById('offer-submit').click();
  })()`);
  await sleep(250);
  check('after edit, example is cheapest again', (await evalJs(`document.querySelector('.offer-card.best h3').textContent`)) === 'Example Bank - Personal');
  check('still 2 offers after edit', (await evalJs(`document.querySelectorAll('.offer-card').length`)) === 2);

  // --- schedule tab ---
  await evalJs(`document.querySelector('[data-tab="schedule"]').click()`);
  await sleep(200);
  check('schedule shows 12 rows', (await evalJs(`document.querySelectorAll('#schedule-body tr').length`)) === 12);
  check('first schedule interest is 5,208', (await evalJs(`document.querySelector('#schedule-body tr td:nth-child(2)').textContent`)).includes('5,208'));
  check('yearly summary has 3 rows', (await evalJs(`document.querySelectorAll('#yearly-body tr').length`)) === 3);
  check('no horizontal overflow (schedule)', (await evalJs('document.documentElement.scrollWidth')) <= WIDTH + 1);

  // --- affordability tab ---
  await evalJs(`document.querySelector('[data-tab="afford"]').click()`);
  await sleep(200);
  await evalJs(`(function(){ const i=document.getElementById('income-input'); i.value='50000'; i.dispatchEvent(new Event('input')); })()`);
  await sleep(250);
  check('affordability cards render (2)', (await evalJs(`document.querySelectorAll('.afford-card').length`)) === 2);
  check('EMI ratio shown', (await evalJs(`document.querySelector('.afford-card').textContent`)).includes('%'));
  check('no horizontal overflow (afford)', (await evalJs('document.documentElement.scrollWidth')) <= WIDTH + 1);

  // --- language toggle ---
  await evalJs(`document.getElementById('lang-toggle').click()`);
  await sleep(250);
  check('BN toggle changes title', (await evalJs(`document.getElementById('app-title').textContent`)) === '\u09b2\u09cb\u09a8 \u0995\u09ae\u09aa\u09c7\u09af\u09bc\u09be\u09b0 \u09ac\u09bf\u09a1\u09bf');
  check('BN digits appear in offer card', /[\u09e6-\u09ef]/.test(await evalJs(`document.querySelector('.offer-card').textContent`)));
  await evalJs(`document.getElementById('lang-toggle').click()`);
  await sleep(200);
  check('toggle back to English', (await evalJs(`document.getElementById('app-title').textContent`)) === 'Loan Compare BD');

  // --- data tab: bad import rejected, erase flow ---
  await evalJs(`document.querySelector('[data-tab="data"]').click()`);
  await sleep(150);
  await evalJs(`(function(){ document.getElementById('import-text').value='{"app":"nope"}'; document.getElementById('import-btn').click(); })()`);
  await sleep(200);
  check('bad import rejected', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('not valid'));
  check('bad import keeps 2 offers', (await evalJs(`JSON.parse(localStorage.getItem('loan-compare-bd-v1')).offers.length`)) === 2);
  await evalJs(`(function(){ document.getElementById('erase-input').value='delete'; document.getElementById('erase-btn').click(); })()`);
  await sleep(150);
  check('erase requires exact DELETE', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('DELETE'));
  await evalJs(`(function(){ document.getElementById('erase-input').value='DELETE'; document.getElementById('erase-btn').click(); })()`);
  await sleep(200);
  check('erase confirms', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('erased'));
  check('erase wipes offers', (await evalJs(`JSON.parse(localStorage.getItem('loan-compare-bd-v1')).offers.length`)) === 0);

  // --- reload persistence: language persists ---
  await sendS('Page.navigate', { url: fileUrl });
  await sleep(1000);
  check('empty state shows after erase + reload', (await evalJs(`document.querySelector('.offers-list .empty') !== null`)));

  // --- error / network hygiene ---
  check('zero console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('zero page exceptions', pageErrors.length === 0, pageErrors.join(' | '));
  check('zero non-file network requests', extRequests.length === 0, extRequests.join(', '));

  console.log(`\n${checks - failures.length}/${checks} checks passed${failures.length ? ', FAILURES:\n- ' + failures.join('\n- ') : ''}`);

  browserWs.close();
  chrome.kill();
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error('SMOKE CRASH:', e); chrome.kill(); process.exit(1); });
