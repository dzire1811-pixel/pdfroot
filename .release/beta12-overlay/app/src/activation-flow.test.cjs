const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function ui(overrides = {}) {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, { hidden: false, disabled: false, textContent: '', value: '', dataset: {}, firstChild: { textContent: '' },
      handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }, focus() {}, scrollIntoView() {} });
    return elements.get(selector);
  }
  const calls = [];
  const api = { licenseStatus: async () => ({ ok: false }), accountStatus: async () => ({}), paymentAvailable: async () => false,
    accountSummary: async () => ({}), googleSignIn: async plan => { calls.push(['google', plan]); return { email: 'buyer@example.com', provider: 'google', payment: { amountPaise: 19900 } }; },
    startPayment: async () => { calls.push(['payment']); return { amountPaise: 19900 }; }, verifyLoginCode: async () => ({ email: 'buyer@example.com', provider: 'email' }),
    ...overrides };
  const context = vm.createContext({ document: { querySelector: element, body: { classList: { add() {}, remove() {} } }, addEventListener() {} }, window: { pdfrootDesktop: api },
    setTimeout() {}, setInterval() {}, Date, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'ui/activation.js'), 'utf8'), context);
  return { element, calls, run: expression => vm.runInContext(expression, context), async click(selector) { const el = element(selector); await el.handlers.click({ currentTarget: el }); } };
}

test('Google paid plan uses prepared checkout once without opening a second payment tab', async () => {
  const u = ui();
  await u.click('#choose-pro');
  assert.equal(u.element('#email-entry').hidden, false);
  await u.click('#google-sign-in');
  assert.deepEqual(u.calls, [['google', 'paid']]);
  assert.equal(u.element('#signin-modal').hidden, true);
  assert.equal(u.element('#online-payment').hidden, false);
  assert.match(u.element('#payment-progress').textContent, /Complete payment/);
});

test('email verified users can pay and checkout does not wait for summary API', async () => {
  const u = ui({ accountSummary: () => new Promise(() => {}) });
  await u.click('#choose-pro');
  await u.click('#verify-code');
  assert.deepEqual(u.calls, [['payment']]);
});

test('checkout failure stays visible and retry reuses the signed-in account', async () => {
  const u = ui({ googleSignIn: async () => ({ email: 'buyer@example.com', provider: 'google', paymentError: 'network unavailable' }) });
  await u.click('#choose-pro'); await u.click('#google-sign-in');
  assert.equal(u.element('#online-payment').hidden, false);
  assert.equal(u.element('#retry-payment').hidden, false);
  assert.match(u.element('#payment-progress').textContent, /network unavailable/);
  await u.click('#retry-payment');
  assert.deepEqual(u.calls, [['payment']]);
});

test('Google failure keeps email option visible with recovery message', async () => {
  const u = ui({ googleSignIn: async () => ({ error: 'Sign-in failed' }) });
  await u.click('#choose-pro'); await u.click('#google-sign-in');
  assert.match(u.element('#account-progress').textContent, /email code/);
  assert.equal(u.element('#email-entry').hidden, false);
  assert.equal(u.element('#google-sign-in').disabled, false);
});

test('existing trial sync never claims a failed checkout was paid', async () => {
  const u = ui({ googleSignIn: async () => ({ email: 'buyer@example.com', paymentError: 'offline' }),
    checkPayment: async () => ({ state: 'active', newlyActivated: false, status: { ok: true, payload: { plan: 'trial' } } }) });
  await u.click('#choose-pro'); await u.click('#google-sign-in');
  await u.run('checkPayment()');
  assert.match(u.element('#payment-progress').textContent, /offline/);
  assert.equal(u.element('#retry-payment').hidden, false);
});
