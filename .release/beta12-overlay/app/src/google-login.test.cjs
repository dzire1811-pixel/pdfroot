const test = require('node:test');
const assert = require('node:assert/strict');
const { signInWithGoogle } = require('./google-login.cjs');

async function run({ exchange, tokenOk = true, badState = false, canceled = false }) {
  let browserResponse;
  let responseDone;
  const responsePromise = new Promise(resolve => { responseDone = resolve; });
  let focused = 0;
  const login = signInWithGoogle({
    clientId: 'example.apps.googleusercontent.com', timeoutMs: 1000,
    onCallback: () => focused++,
    fetchImpl: async () => ({ ok: tokenOk, json: async () => tokenOk ? { id_token: 'signed-id-token' } : {} }),
    exchange,
    openExternal: async target => {
      const auth = new URL(target);
      assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
      const callback = new URL(auth.searchParams.get('redirect_uri'));
      callback.searchParams.set('state', badState ? 'invalid' : auth.searchParams.get('state'));
      callback.searchParams.set(canceled ? 'error' : 'code', canceled ? 'access_denied' : 'google-code');
      fetch(callback, { redirect: 'manual' }).then(async response => {
        browserResponse = { status: response.status, location: response.headers.get('location'), body: await response.text() };
        responseDone();
      });
    },
  });
  const outcome = await login.then(result => ({ result }), error => ({ error }));
  await responsePromise;
  return { ...outcome, focused, browserResponse };
}

test('paid Google sign-in redirects the original callback tab to secure checkout after verified exchange', async () => {
  const r = await run({ exchange: async token => {
    assert.equal(token, 'signed-id-token');
    return { email: 'buyer@example.com', payment: { paymentUrl: 'https://rzp.io/i/checkout' } };
  } });
  assert.equal(r.focused, 1);
  assert.equal(r.browserResponse.status, 303);
  assert.equal(r.browserResponse.location, 'https://rzp.io/i/checkout');
  assert.equal(r.result.email, 'buyer@example.com');
});

test('trial callback shows success only when account exchange really succeeds', async () => {
  const r = await run({ exchange: async () => ({ email: 'buyer@example.com' }) });
  assert.equal(r.browserResponse.status, 200);
  assert.match(r.browserResponse.body, /You are signed in/);
});

test('token/account errors show recovery instructions instead of false success', async () => {
  for (const options of [ { tokenOk: false }, { exchange: async () => { throw Error('account unavailable'); } }, { canceled: true } ]) {
    const r = await run({ exchange: async () => ({}), ...options });
    assert.ok(r.error);
    assert.equal(r.browserResponse.status, 400);
    assert.match(r.browserResponse.body, /email code option/);
    assert.doesNotMatch(r.browserResponse.body, /You are signed in/);
  }
});

test('checkout failure keeps a verified account and explains retry in browser', async () => {
  const r = await run({ exchange: async () => ({ email: 'buyer@example.com', paymentError: 'offline' }) });
  assert.equal(r.result.email, 'buyer@example.com');
  assert.match(r.browserResponse.body, /Retry payment/);
  assert.equal(r.browserResponse.location, null);
});

test('invalid OAuth state and untrusted redirect never open payment', async () => {
  let exchanges = 0;
  const bad = await run({ badState: true, exchange: async () => { exchanges++; return {}; } });
  assert.equal(exchanges, 0);
  assert.equal(bad.browserResponse.status, 400);
  const untrusted = await run({ exchange: async () => ({ payment: { paymentUrl: 'https://rzp.io.evil.test/pay' } }) });
  assert.ok(untrusted.error);
  assert.equal(untrusted.browserResponse.location, null);
});
