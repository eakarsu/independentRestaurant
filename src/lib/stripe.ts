/**
 * Lazily-constructed Stripe client.
 *
 * The Stripe constructor throws when no secret key is provided, so building it
 * at module load would crash any route that imports it (e.g. /api/orders/:id/pay
 * and the payments webhook) whenever STRIPE_SECRET_KEY is unset. Constructing it
 * lazily lets those routes load and return a clean "not configured" response
 * instead of a 500.
 *
 * Add STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook) to .env to
 * enable payments.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  }
  return _stripe;
}
