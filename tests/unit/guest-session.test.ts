import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertGuestOrigin, codeDigest, equalDigest, guestCode, guestToken, tokenDigest } from '@/lib/commerce/guest-session';

test('guest checkout uses bounded one-time codes and domain-separated session digests', () => {
  const previous = process.env.GUEST_CHECKOUT_SECRET;
  process.env.GUEST_CHECKOUT_SECRET = 'unit-test-secret-that-is-long-enough-for-hmac';
  try {
    const code = guestCode();
    assert.match(code, /^\d{6}$/);
    const digest = codeDigest('challenge-a', code);
    assert.equal(equalDigest(digest, codeDigest('challenge-a', code)), true);
    assert.equal(equalDigest(digest, codeDigest('challenge-b', code)), false);
    assert.equal(equalDigest(digest, codeDigest('challenge-a', '000000')), code === '000000');
    const token = guestToken();
    assert.ok(token.length >= 40);
    assert.notEqual(tokenDigest(token), codeDigest('challenge-a', token));
    assert.throws(() => assertGuestOrigin(new Request('https://restaurant.example/api/online-ordering/guest/verify', { method: 'POST', headers: { origin: 'https://attacker.example' } })));
  } finally {
    if (previous === undefined) delete process.env.GUEST_CHECKOUT_SECRET;
    else process.env.GUEST_CHECKOUT_SECRET = previous;
  }
});
