const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldOpenCatalogAfterSync } = require('./payment-navigation.cjs');

test('background sync of the existing active trial or paid licence keeps the plan screen open', () => {
  for (const plan of ['trial', 'monthly']) {
    const status = { ok: true, payload: { plan, licenseId: 'existing', expiresAt: '2026-11-01' } };
    assert.equal(shouldOpenCatalogAfterSync(status, { state: 'active', status }), false);
  }
});

test('newly activated trial, paid upgrade or renewal opens the tools only after activation', () => {
  const trial = { ok: true, payload: { plan: 'trial', licenseId: 'trial', expiresAt: '2026-10-20' } };
  const paid = { ok: true, payload: { plan: 'monthly', licenseId: 'paid', expiresAt: '2026-11-09' } };
  assert.equal(shouldOpenCatalogAfterSync({ ok: false }, { state: 'active', status: trial }), true);
  assert.equal(shouldOpenCatalogAfterSync(trial, { state: 'active', status: paid }), true);
  assert.equal(shouldOpenCatalogAfterSync(paid, { state: 'active', status: { ...paid, payload: { ...paid.payload, expiresAt: '2026-12-09' } } }), true);
  assert.equal(shouldOpenCatalogAfterSync(trial, { state: 'pending' }), false);
});
