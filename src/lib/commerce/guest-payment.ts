/** Guest card checkout is opt-in and restricted to Stripe test credentials. */
type StripeSandboxEnvironment = { GUEST_STRIPE_SANDBOX_ACCEPTED?: string; SPLIT_STRIPE_SANDBOX_ACCEPTED?: string; STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; NEXTAUTH_URL?: string };
function testStripeReady(environment: StripeSandboxEnvironment) {
  const key = environment.STRIPE_SECRET_KEY || '';
  let returnUrl: URL;
  try { returnUrl = new URL(environment.NEXTAUTH_URL || ''); }
  catch { return false; }
  return /^(sk|rk)_test_[A-Za-z0-9]+$/.test(key) &&
    /^whsec_[A-Za-z0-9]+$/.test(environment.STRIPE_WEBHOOK_SECRET || '') &&
    (returnUrl.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(returnUrl.hostname));
}
export function guestStripeSandboxReady(environment: StripeSandboxEnvironment = process.env) {
  return environment.GUEST_STRIPE_SANDBOX_ACCEPTED === 'true' && testStripeReady(environment);
}
export function splitStripeSandboxReady(environment: StripeSandboxEnvironment = process.env) {
  return environment.SPLIT_STRIPE_SANDBOX_ACCEPTED === 'true' && testStripeReady(environment);
}
