# Completeness Review: independentRestaurant

**Review date:** 2026-07-18

## Assessment basis

Static inspection of project-owned source and configuration only; no dependency installation, build, database migration, external-service call, or runtime launch was performed. The scan considered 209 project files (190 source files), 1 manifest(s), 0 test-like file(s), and 0 CI workflow(s), excluding dependency/generated directories.

## Classification

**Functional but incomplete**

This is a substantive but unfinished commerce/order operations application, not just an empty scaffold. Inspection found 190 source files across `src/`, `prisma/`, `scripts/` using Next.js, React, Prisma; however, the checked-in workflow and delivery controls do not yet demonstrate a complete, production-operable product.

## Why it is not complete

- Generated gap/visualization routes describe missing capabilities or simulate recommendations; they do not implement the underlying domain operation.
- Generic LLM calls are used as product behavior without enough typed tools, grounded evidence, deterministic rules, or output evaluation.
- Mock, demo, sample, fixture, or placeholder behavior remains in executable/product paths.
- No recognizable project-owned automated tests were found for the main workflow.
- No checked-in CI workflow proves builds, tests, migrations, and security checks on every change.

## Needed features

1. Implement an idempotent order state machine covering reservation, payment, cancellation, refund, fulfillment, and exception recovery.
2. Connect real inventory, tax, payment, shipping/delivery, and partner-webhook providers behind retry-safe adapters.
3. Add role-scoped customer, operator, and merchant workflows with immutable order and refund audit history.
4. Test duplicate webhooks, partial fulfillment, payment failure, overselling, and reconciliation end to end.
5. Add risk-based unit, integration, and end-to-end tests in CI, including migration and failure-path coverage.

## Risks or launch blockers

- Credential/configuration exposure: environment files are present in the repository tree and must be checked against Git history and rotated if real.
- Automation contains destructive process, filesystem, or database operations; do not run it on a shared machine without review.
- Startup appears coupled to seed/migration behavior, risking data mutation or non-repeatable launches.
- AI-provider availability, cost, privacy, prompt injection, and unvalidated output are launch risks until bounded and evaluated.

## Evidence inspected

- `README.md`
- `src/app/api/gap-no-accounting-export-quickbooks-xero/route.ts:3`
- `src/components/ai/assistant-widget.tsx:174`
- `src/app/layout.tsx`
- `package.json`
- `start.sh`

## Recommended next action

Choose one real commerce/order operations journey, define acceptance criteria and external contracts, then close its persistence, permission, integration, failure, and test gaps before expanding features.

## Implementation progress (2026-07-20)

**2026-07-19 — Implemented the source-actionable review scope.** Replaced client-priced/directly mutable orders with a server-priced, idempotent, serializable order workflow covering inventory reservation, payment, cancellation/release, partial item fulfillment, delivery, completion, refunds, exceptions, and recovery. Added atomic oversell prevention, PostgreSQL and HTTP inventory adapters, configured/HTTP tax adapters, Stripe Checkout/refund integration, signed duplicate-safe Stripe and partner webhooks, a leased retrying delivery outbox, reconciliation reporting, role/customer ownership controls, revocable account sessions, one-time password resets, and hash-chained append-only order/refund evidence protected by database triggers. Removed generated gap/Codex/batch/AI routes, generic LLM behavior, sample seeds/credentials, plaintext browser credential entry, direct order/payment edits, order deletion, unsafe split payments, and unscoped bulk mutation. Added baseline-plus-upgrade Prisma migrations, safe explicit startup/migration/provisioning/backup/restore commands, provider and incident runbooks, Docker/Compose, and CI with PostgreSQL 17 and security/image gates.

Validation completed on 2026-07-19: Prisma format/validate/client generation; both migrations replayed from empty on a disposable PostgreSQL 17 instance; 6 unit tests and 1 database integration workflow passed (idempotency, concurrent oversell, partial fulfillment, payment failure, payment capture/refund, cancellation/release, duplicate webhook, and audit-chain checks); ESLint and strict TypeScript passed; Next.js 16.2.10 production build passed; `npm audit` reported 0 vulnerabilities; Gitleaks scanned all 9 commits with no leaks; Compose configuration, `bash -n`, and `git diff --check` passed. Independent verification replayed both migrations to 59 tables and three custom triggers on fresh PostgreSQL 17, reran all seven checks, lint, strict types, production build, audit, Compose/shell validation, and source/full-history secret scans. It also added fail-closed production preflight for the external database, auth/worker keys, HTTPS URL, tax, Stripe webhooks, and email delivery; removed client generation from startup; made CI keys ephemeral; and strengthened audit/full-history secret gates. The local Docker daemon and ShellCheck executable were unavailable, so local image construction and ShellCheck were not run; CI performs the image build, while shell syntax was validated locally. Launch still requires jurisdiction-approved tax configuration, real Stripe/tax/delivery/partner credentials and webhook registration, credential rotation if any ignored local `.env` value is real, a rehearsed restore, and staging provider/evidence acceptance tests.

## Runtime verification (2026-07-20)

- Verified `start.sh` against a fresh Prisma/PostgreSQL schema on `55661`, with Next.js bound explicitly to `127.0.0.1:6130` and `6131` reserved; the launcher resolves the real project root when executed from the validator's symlink fixture. All assigned ports were released afterward.
- The first recorded attempt reached the real NextAuth routes but retained `FAILED login_failed` because the existing explicit provisioner used top-level `await` under CommonJS `tsx`. Wrapping it in an async entry function and exposing the guarded disposable `create-admin` alias fixed provisioning without enabling public registration.
- The final attempt provisioned an environment-supplied administrator, completed the NextAuth credentials flow, and verified `/api/auth/session`: `API_VERIFIED startup_login_session_api`.
- Both checked-in Prisma migrations applied and replayed with no pending work; all 6 unit tests and the PostgreSQL integration workflow passed. ESLint, strict TypeScript, and the optimized Next.js production build also passed. Every attempt is recorded in `_runtime_non_suite_repair_shard3r.tsv`.
