import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { guestStripeSandboxReady, splitStripeSandboxReady } from '@/lib/commerce/guest-payment';

test('guest card checkout stays closed without explicit sandbox acceptance and test credentials', () => {
  const ready = { GUEST_STRIPE_SANDBOX_ACCEPTED: 'true', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example', NEXTAUTH_URL: 'https://restaurant.example' };
  assert.equal(guestStripeSandboxReady(ready), true);
  assert.equal(guestStripeSandboxReady({ ...ready, GUEST_STRIPE_SANDBOX_ACCEPTED: 'false' }), false);
  assert.equal(guestStripeSandboxReady({ ...ready, STRIPE_SECRET_KEY: 'sk_live_example' }), false);
  assert.equal(guestStripeSandboxReady({ ...ready, STRIPE_WEBHOOK_SECRET: '' }), false);
  assert.equal(guestStripeSandboxReady({ ...ready, NEXTAUTH_URL: 'javascript:alert(1)' }), false);
  assert.equal(splitStripeSandboxReady({ ...ready, SPLIT_STRIPE_SANDBOX_ACCEPTED: 'true' }), true);
  assert.equal(splitStripeSandboxReady(ready), false);
  assert.equal(splitStripeSandboxReady({ ...ready, SPLIT_STRIPE_SANDBOX_ACCEPTED: 'true', STRIPE_SECRET_KEY: 'sk_live_example' }), false);
});
