# Independent Restaurant Operations

A Next.js/PostgreSQL restaurant operations application centered on an auditable order workflow. Orders are priced from server-owned menu data, reserve recipe inventory transactionally, use explicit state transitions, and retain hash-chained order/refund evidence.

## Core workflow

1. A customer or operator creates an order with an `Idempotency-Key` header.
2. The server validates menu/modifier availability, obtains a provider-backed tax quote, and atomically reserves ingredient inventory.
3. Operators progress the order and individual items through guarded kitchen/fulfillment states.
4. Stripe Checkout and signed, duplicate-safe payment-intent webhooks capture payment. Refunds require a merchant role and provider idempotency.
5. Delivery work is committed to a leased PostgreSQL outbox and retried with exponential backoff. Reconciliation reports expose stale payments, provider failures, dead letters, and expired reservations.

The order backend guards payment and fulfillment changes. Other workflows are being completed; see [FEATURE_STATUS.md](FEATURE_STATUS.md) for verified behavior and remaining gaps.

## Local setup

Requirements: Node 22+, PostgreSQL 17+, and provider credentials appropriate to the workflow.

```bash
cp .env.example .env
# Edit .env with the actual local database, secrets and ports before continuing.
npm ci
npm run db:generate
./start.sh
```

`start.sh` loads the ignored `.env`, applies pending Prisma migrations, preserves
an existing administrator, optionally adds sample records when `LOAD_DEMO_DATA=true`,
and starts the development server plus UI proxy. It does not create/reset the
database or kill other applications. Dependencies must be installed explicitly.
Quote shell values containing spaces, `&`, or other shell characters.

For explicit account provisioning, set `ALLOW_USER_PROVISION=1`,
`PROVISION_USER_EMAIL`, `PROVISION_USER_NAME`, `PROVISION_USER_PASSWORD` (14+ characters),
and `PROVISION_USER_ROLE`, then run `npm run user:provision`. An explicit provisioning
command can update an existing account; routine startup preserves it.

For a database previously created by `prisma db push`, first take and verify a backup, confirm that it matches the baseline schema, then mark only the baseline as applied:

```bash
npx prisma migrate resolve --applied 20260718000000_baseline
npx prisma migrate deploy
```

New databases use `npx prisma migrate deploy` directly and receive both migrations.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:unit
RUN_DATABASE_TESTS=1 DATABASE_URL=postgresql://... npm run test:integration
npm run build
npm audit --audit-level=low
```

Integration tests must run only against a disposable database. CI provisions PostgreSQL 17, replays migrations from empty, exercises idempotency, oversell concurrency, partial fulfillment, payment failure, cancellation/release, webhook duplication, and audit-chain verification, then builds the production image.

See [operations](docs/OPERATIONS.md) for provider contracts, reconciliation, backup/restore, rollout, and incident procedures.

## Local authentication routing

Local development uses webpack (`next dev --webpack`). On this external-volume workspace, the Turbopack development server returned 404 for nested routes even when their source files existed, including `/login` and `/api/auth/session`. Keep the webpack flag when launching development directly.

Open the UI proxy URL printed by `./start.sh` (currently `http://127.0.0.1:30875`). The protected-page proxy and NextAuth both use `/login`. With the app running, `npm run test:auth-routing` checks that auth endpoints return JSON and anonymous dashboard visits redirect to the login page. Set `AUTH_CHECK_URL` to check a different local port.

The UI proxy forwards HTTP and WebSocket upgrades so the development client can connect and the login controls become interactive. Its regression test covers JSON/cookie forwarding and bidirectional upgrade traffic. After changing the development bundler, restart both processes and discard stale generated `.next/dev` output if necessary.

## Local sample data

After configuring the existing administrator and deploying migrations, run
`npm run demo-data:load` to add fictional sample records to the local database.
`npm run demo-data:verify` also reloads them and verifies that records and the
administrator are unchanged. Records persist across restarts; existing edits are
preserved and deterministic IDs prevent duplicates.

To restore missing samples during local startup, set `LOAD_DEMO_DATA=true` in the
ignored `.env`. It defaults to false. The loader refuses production mode and remote
databases. It does not send messages, run AI, charge cards, or manufacture provider
receipts. Demo requests remain pending/draft and demo promotions remain inactive.
Appointment dates are set on the first load and are preserved thereafter; use the
date controls to view them on later days.

When running the portfolio locally, include `connection_limit=2&pool_timeout=30`
in the PostgreSQL `DATABASE_URL` query parameters to keep simultaneous apps from
exhausting the shared database connection limit. Restart after changing .env.

## Operations additions (September 6)

- The dashboard reads real payments, refunds, orders, reservations and low-stock records. Net receipts include tax/tips and remain separated by currency; they are not an accounting revenue statement.
- `/timesheets` provides clock-in/out, breaks, corrections, approval and base hourly pay CSV export.
- Operational APIs enforce login and role checks. The app remains a single-restaurant data boundary until comprehensive organization/location scoping is implemented.
- Loyalty adjustments are validated, atomic, audited and deduplicated with an `Idempotency-Key`.
- Notification history distinguishes queued, accepted, delivered, rejected and uncertain outcomes. Historical rows without provider references remain unverified.
- `/settings` persists restaurant profile/hours and supports password changes. API/provider secrets remain environment configuration.
- Restaurant-specific auth cookies prevent session collisions with other local projects; sign in once after this change.

The notification worker is disabled unless `ENABLE_NOTIFICATION_DELIVERY=true`.
When enabled, `npm run worker:once` processes a delivery event and a notification.
Configure Resend email or Twilio SMS and their verified callback endpoints:
`/api/notification-webhooks/resend` and `/api/notification-webhooks/twilio`.
Set `NOTIFICATION_WEBHOOK_BASE_URL` to the externally reachable application origin
for Twilio. Uncertain sends are not automatically repeated. Marketing delivery
requires both message confirmation and saved customer opt-in.

Provider references:
[Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests),
[Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys),
[Twilio callback security](https://www.twilio.com/docs/usage/webhooks/webhooks-security).

`npm run test:operations` creates a disposable schema in the configured local
PostgreSQL database, applies migrations, runs order/operations transaction tests
with provider fixtures, and removes that schema. It does not modify existing
application records or send external messages.

Payment recovery is available in an order's detail dialog under **Payments and refunds**. Use the existing checkout after a network error; the service holds one attempt and reuses its provider key. Reconcile a `cs_…` session (or explicitly expire an open session) before starting another payment. A browser return is not payment evidence. Manager refunds use the original captured receipt and reserve the available balance; unknown refunds remain held until the original `re_…` receipt is reconciled. Configure signed `payment_intent.succeeded`, `payment_intent.payment_failed`, `refund.created`, `refund.updated` and `refund.failed` callbacks at `/api/payments/webhook`. Callback processing failures can retry without duplicating financial effects.

Orders lacking a matching server pricing/tax receipt require separate legacy reconciliation before payment. Tax must be explicitly configured; this implementation does not choose a tax rate. Split tender, cash-drawer closeout and real provider/device acceptance remain incomplete. The September 6 payment checkpoint passed 15 unit tests, 3 isolated PostgreSQL integration scenarios, TypeScript, lint, production build and authenticated browser reads. See `FEATURE_STATUS.md` for scope and limitations.

Run `npm run test:restore` to create a private backup, restore it into a disposable local PostgreSQL database, and read all restored public tables. It requires local PostgreSQL tools and permission to create a temporary database. The backup remains under `~/.codex/backups/<project>/`; the temporary database is removed after the check. The September 6 full restore rehearsal passed.

Customer pickup ordering: configure the restaurant's actual hours and tax, then open **Online Ordering** to review notice/horizon limits and enable requests. Create a customer's profile and verify their identity/email before provisioning their customer login. Share `/order-online`; customers review a current quote and request pickup, staff accept the pending request in Orders, and customers can then open card checkout. Pending customer cancellations restore reserved stock. A printed QR code can point to the same URL.

`node scripts/test-online-browser.cjs` runs the customer/staff pickup journey using installed Chrome, Playwright and a disposable local PostgreSQL schema on port 30982. It requires an existing production build and never contacts a payment provider. `node scripts/test-operations.cjs` isolates each integration file in its own schema. The September 6 authenticated pickup checkpoint passed these checks; anonymous guest ordering and delivery-provider acceptance remain unfinished.

Local restart behavior: `./start.sh` clears this project’s configured ports before migrations or builds. It stops the prior project server tree, waits for release and verifies the ports are free. If another application owns a configured port, startup stops with an explanation instead of terminating that application. Run `npm run test:startup` to verify both cases.

Local autofill is enabled by `ENABLE_DEMO_CREDENTIAL_AUTOFILL=true` in the ignored `.env`, with the existing administrator credentials configured there. The login button checks availability without retrieving passwords, then fills the configured account when clicked. Availability and credential responses are never cached.
