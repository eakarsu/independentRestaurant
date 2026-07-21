# Independent Restaurant Operations

A Next.js/PostgreSQL restaurant operations application centered on an auditable order workflow. Orders are priced from server-owned menu data, reserve recipe inventory transactionally, use explicit state transitions, and retain hash-chained order/refund evidence.

## Core workflow

1. A customer or operator creates an order with an `Idempotency-Key` header.
2. The server validates menu/modifier availability, obtains a provider-backed tax quote, and atomically reserves ingredient inventory.
3. Operators progress the order and individual items through guarded kitchen/fulfillment states.
4. Stripe Checkout and signed, duplicate-safe payment-intent webhooks capture payment. Refunds require a merchant role and provider idempotency.
5. Delivery work is committed to a leased PostgreSQL outbox and retried with exponential backoff. Reconciliation reports expose stale payments, provider failures, dead letters, and expired reservations.

Generated gap pages, generic LLM behavior, sample data, public registration, direct payment/status edits, order deletion, and unscoped bulk mutation were removed from product paths.

## Local setup

Requirements: Node 22+, PostgreSQL 17+, and provider credentials appropriate to the workflow.

```bash
cp .env.example .env
npm ci
./start.sh --migrate
npm run user:provision
./start.sh --dev
```

User provisioning is an explicit operation. Set `ALLOW_USER_PROVISION=1`, `PROVISION_USER_EMAIL`, `PROVISION_USER_NAME`, `PROVISION_USER_PASSWORD` (14+ characters), and `PROVISION_USER_ROLE` for that command. Do not place production credentials in shell history.

`./start.sh` never creates or resets a database, writes an environment file, seeds records, kills a process, installs dependencies, runs migrations implicitly, or supplies a default secret.

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
