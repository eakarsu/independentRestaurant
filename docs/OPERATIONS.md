# Operations runbook

## Provider contracts

- Tax: set `TAX_PROVIDER_URL` and `TAX_PROVIDER_TOKEN` for `POST /v1/tax/quotes`, or set a jurisdiction-reviewed `TAX_RATE_BPS`. Amounts are integer cents and provider output is range-checked.
- Inventory: the default `PostgresInventoryProvider` reserves recipe ingredients using conditional atomic decrements in the same serializable transaction as the order. `HttpInventoryProvider` defines the external reserve/commit/release contract and sends an idempotency key on every request.
- Payment: Stripe Checkout/refund calls use provider idempotency keys, and Checkout creates a metadata-linked PaymentIntent. `STRIPE_WEBHOOK_SECRET` is mandatory for raw-body signature validation. Payment events are accepted once by `(provider,eventId)`.
- Delivery: `POST /v1/deliveries` is invoked from the leased outbox with bearer authentication, an idempotency key, a ten-second timeout, and bounded retry. Eight failed leases become a dead letter.
- Partners: `POST /api/partners/{partner}/webhooks` accepts an HMAC-SHA256 `X-Webhook-Signature`, validates a strict event schema, and deduplicates events. Configure a distinct `PARTNER_WEBHOOK_SECRET_{PARTNER}` per partner.

Do not store API tokens through the browser or `Integration.config`. Runtime credentials belong in the deployment secret store. Rotate any credential found in local `.env` files or repository history before launch.

## Reconciliation and recovery

Merchant roles can read `GET /api/reconciliation`. Investigate every stale payment, failed webhook, expired reservation, dead-letter delivery, or paid order without a captured attempt. Compare provider evidence before changing state. Recovery uses a new idempotency key and an allowed transition; never edit order/payment columns directly.

Run one outbox job with `npm run worker:once`, or call the protected internal endpoint using `INTERNAL_WORKER_SECRET`. Multiple workers are safe because claims use `FOR UPDATE SKIP LOCKED` and expiring leases.

## Backup and restore

Create and validate a custom-format backup:

```bash
scripts/backup.sh /explicit/secure/path/restaurant-YYYYMMDD.dump
```

Restore only during an announced maintenance window to a verified target. The restore command prints database/server identity and requires `ALLOW_DATABASE_RESTORE=I_UNDERSTAND_THIS_REPLACES_DATA`. Rehearse restoration to an isolated server and record recovery time and row-count/audit-chain checks before approving production rollout.

## Rollout

1. Rotate exposed or historical credentials and verify the secret scan.
2. Back up and rehearse restore.
3. Deploy the migration job once; do not let every app replica migrate.
4. Verify provider health and signed webhook delivery in provider dashboards.
5. Create a low-value order, exercise inventory, payment, kitchen items, delivery, cancellation/refund, and audit-chain inspection.
6. Monitor failed webhooks, dead letters, payment latency, inventory conflicts, and reconciliation output.

If a provider is degraded, keep the order in its explicit pending/failed/exception state. Never claim success or substitute generated data. For payment uncertainty, reconcile with Stripe before retrying or refunding.
