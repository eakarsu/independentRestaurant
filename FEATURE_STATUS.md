# Independent Restaurant — feature status

Assessment date: September 6, 2026.

## Verdict

The app is not complete or ready for production restaurant operations. It has
a substantial order/payment backend and many operational screens, but some
screens still contain hardcoded data, some workflows simulate completion, and
several APIs lack authentication and authorization.

This assessment reviewed the two Desktop screenshots taken at 10:32:44 and
10:33:00, representative source files, local configuration presence, existing
unit tests, and anonymous read-only requests to the running local server.
It is not a complete route-by-route or end-to-end acceptance audit.

## What the screenshots actually show

`src/app/(dashboard)/dashboard/page.tsx` hardcodes all of the following:

- Today's revenue: $4,325.00 and +12.5%.
- Active orders: 24 and +3 from last hour.
- Reservations: 18 and 5 upcoming.
- Customers served: 127 and +8.2%.
- ORD-001 through ORD-004, their totals, tables and statuses.
- John Smith, Sarah Johnson, Mike Wilson and Emily Brown reservations.
- Low chicken inventory, a Google review and a staff sickness alert.

These are not live database results. The header also hardcodes its three
notifications, and its search input has no search behavior.
Successful login and a populated screenshot do not demonstrate live operations.

## Current implementation assessment

“Implemented backend” means relevant server code exists, not that the entire
customer/operator journey has passed live acceptance testing.

| Area | Status | Evidence / remaining limits |
| --- | --- | --- |
| Login and protected dashboard | Working in supplied screenshots | Page protection does not cover all APIs. |
| Dashboard and header alerts | Hardcoded demonstration | Replace with authenticated database queries, defined metrics, real empty/error states and links to actual records. |
| Orders and kitchen transitions | Implemented backend | `src/lib/commerce/orders.ts` and `state-machine.ts`: server pricing, idempotency, guarded order/item transitions and audit evidence. UI journey still needs full acceptance testing. |
| Recipe inventory reservations | Implemented backend | Transactional ingredient reservation/release and oversell test code exist. Purchasing, receiving and stock adjustments require separate review. |
| Tax calculation | Implemented adapter; configuration incomplete locally | Neither `TAX_RATE_BPS` nor `TAX_PROVIDER_URL` is present in local `.env`; do not invent a tax rate. |
| Stripe payment, webhook and refunds | Implemented backend; live behavior unverified | Provider code and signed webhook handling exist. Environment values are present, but validity and provider delivery were not tested. |
| Split checks and split payment | Incomplete / disabled | `/api/orders/[id]/split` permits reads but rejects mutations until connected to the payment workflow. |
| Delivery | Adapter/outbox foundation | Local `.env` has no fulfillment provider URL. A token or integration toggle alone does not establish a connection. |
| Reconciliation | Implemented backend | `/api/reconciliation` and leased delivery outbox exist; worker deployment and operational recovery need verification. |
| Reservations, tables and waitlist | Partial | CRUD exists. Reservation API has no route-level auth; scheduling conflicts, ownership and capacity need enforced workflow validation. |
| Menu, modifiers, recipes and allergens | Partial | Models/routes/pages exist. Catalog configuration, availability and customer/operator journeys need end-to-end checks. |
| Inventory, vendors, purchase orders and waste | Partial | Schema and some CRUD exist; schema presence does not establish a complete purchasing/receiving workflow. |
| Staff, schedules, time clock and tips | Partial | Time clock writes lack route-level auth and allow multiple open clock-ins; approval, corrections, payroll export and concurrency controls need work. |
| Customers and loyalty | Partial | Loyalty mutation lacks route-level auth, input bounds, transaction-level atomicity and sufficient balance protection. |
| Promotions and reports | Partial | Data-backed routes exist; pricing application, redemption limits, metric definitions and permissions require acceptance tests. |
| Notifications | Simulated completion; not production-ready | `/api/notifications` uses timers to mark SENT then DELIVERED without a provider call. |
| Locations | Record management only | Location rows exist, but the Location model has no operational relations establishing comprehensive location scoping. |
| Integration management | Partial | Configuration presence and enable flags are not live health checks. Secrets are configured through the environment. |
| Restaurant advice AI | Basic backend exists | `/api/runtime-ai/restaurant-advice` sends a prompt to OpenRouter and saves text. No first-party UI caller was found in the source search. |
| Advanced forecasting/pricing/no-show AI | Not established | Relevant tables exist, but tables alone do not implement forecasting, recommendations, approval or evaluation. |

## Confirmed release blockers

1. **Invented operational data:** dashboard and header show constants as current business facts.
2. **API access controls:** anonymous GETs returned HTTP 200 for `/api/reservations`,
   `/api/notifications` and `/api/notifications/templates`. `/api/orders` correctly
   returned 401. The page proxy does not match these APIs. Related write routes
   also lack authorization in source; no anonymous writes were attempted.
3. **False delivery evidence:** notification timers manufacture sent/delivered states.
4. **Financial and balance integrity:** loyalty needs validated, atomic, audited,
   idempotent changes; split payments remain disabled.
5. **Incomplete runtime setup:** tax and delivery configuration are absent locally.
6. **Documentation drift:** README claims startup never implicitly migrates or
   provisions, while the current `start.sh` runs migrations and admin provisioning.
   Its claim that sample behavior was removed also conflicts with the dashboard.

## Prioritized AI and non-AI backlog

These are proposed implementation items, not completed work. “All possible
features” has no finite endpoint; this list defines a broad restaurant product
scope that can be implemented and verified in stages. Existing partial features
should be completed rather than duplicated.

### Phase 1 — trustworthy foundation

- [ ] Live dashboard with restaurant timezone, location filters, explicit revenue/refund definitions, real orders/reservations and actionable alerts.
- [ ] Authentication and role/ownership checks on every private API, including customer self-service boundaries.
- [ ] Current account revocation and role enforcement; organization and location access where multiple businesses are supported.
- [ ] Strict request schemas, bounded pagination, safe errors, rate limits and audit records for sensitive writes.
- [ ] Idempotency and concurrency controls for stock, loyalty, tips, time entries and booking changes.
- [ ] Real notification outbox, consent/preferences, retries and signed delivery callbacks; remove simulated success.
- [ ] Search, profile/settings actions, responsive navigation, accessibility and consistent loading/error/retry states.
- [ ] Accurate startup instructions and provider setup/status showing configured, verified, unavailable and failed separately.

### Phase 2 — complete guest, POS and kitchen journeys

- [ ] Dine-in, pickup, delivery, scheduled ordering and QR menu/order flow through the same server validation.
- [ ] Table floor plan, capacity-aware reservations, waitlist estimates, seating, table moves and turnover.
- [ ] Deposits, cancellation/no-show policies and reservation reminders with actual payment/delivery evidence.
- [ ] Menu variations, modifier rules, meal courses, combos, timed menus, sold-out items and authoritative allergen information.
- [ ] Split by item/seat/amount, partial tenders, cash handling, card tips, voids, discounts and manager approval.
- [ ] Cash-drawer sessions, paid-in/out, reconciliation, end-of-day close and receipt reprints.
- [ ] Kitchen station routing, course firing, bump/recall, preparation timers and expeditor view.
- [ ] Pickup readiness, delivery handoff, failure recovery and provider reconciliation.
- [ ] Gift-card issuance/redemption/refunds with a protected balance ledger.
- [ ] Refund and dispute administration without losing payment/audit history.

### Phase 3 — inventory, purchasing and workforce

- [ ] Supplier purchase orders, approvals, partial receiving, invoice reconciliation and supplier credits.
- [ ] Stock counts, adjustments, unit conversions, transfers, batch/expiry tracking and recipe yields.
- [ ] Recipe costs, contribution margins, prep plans, par levels and replenishment suggestions.
- [ ] Waste reasons, inventory impact, cost reports and supporting attachments.
- [ ] Availability, time-off requests, shift swaps, schedule publishing and conflict checks.
- [ ] Clock-in/out controls, breaks, corrections, supervisor approval and payroll exports.
- [ ] Configurable tip pooling/distribution with reproducible calculations and correction history.
- [ ] Training records, cleaning/temperature checklists, equipment maintenance and incident follow-up.
- [ ] Catering/events, quotes, deposits, production plans and fulfillment.

### Phase 4 — customers, growth and management

- [ ] Customer profiles, preferences, consent, order history and self-service account controls.
- [ ] Loyalty earning/redemption, tiers, refunds and promotion eligibility/limits.
- [ ] Segmented campaigns, scheduling, unsubscribe handling and provider-backed results.
- [ ] Feedback collection, complaint resolution and review responses with explicit publishing approval.
- [ ] Sales, discounts, refunds, product mix, food cost, labor cost and location comparisons with defined formulas.
- [ ] Accounting exports and reconciliation, scheduled reports and role-appropriate dashboards.
- [ ] Multi-location menus/prices, stock transfers and consolidated reporting.

### Phase 5 — useful AI with evidence and review

- [ ] An accessible AI workspace with saved drafts, source records, model/provider receipt, feedback and approval history.
- [ ] Daily operations summaries grounded in real orders, inventory, reservations and staffing data.
- [ ] Demand forecasting with historical data, backtesting, error measures and explicit cold-start limitations.
- [ ] Prep and replenishment suggestions using forecast demand, recipes, stock and delivery lead times.
- [ ] Menu margin analysis and pricing suggestions requiring manager approval before publishing.
- [ ] Schedule suggestions constrained by availability, coverage and configured work rules.
- [ ] Waste/anomaly detection with supporting transactions and human investigation.
- [ ] Invoice/receipt extraction with original-document references and human approval before posting.
- [ ] Menu description, translation, campaign copy and review-response drafts.
- [ ] Customer support/concierge using approved menu/policy sources and staff escalation.
- [ ] Reservation/order voice assistance only with consent, confirmation and the same validated booking/order APIs.
- [ ] No-show prioritization only after data quality, evaluation and fairness review; no invented risk percentages.
- [ ] Source-based staff knowledge search; allergen information must come from verified recipes, not model guesses.
- [ ] Request/cost budgets, data minimization, job cancellation/recovery and prompt-injection/failure tests.

### Phase 6 — integrations, devices and release

- [ ] Verified payment, delivery marketplace, messaging, accounting and booking adapters with sandbox contract tests.
- [ ] Receipt/kitchen printers, payment terminals, cash drawers, barcode scanning and customer displays through supported device integrations.
- [ ] Mobile/tablet workflow and bounded offline order drafts with reconciliation; offline payment needs explicit provider support.
- [ ] Provider webhook monitoring, dead-letter recovery and a usable reconciliation console.
- [ ] Backup/restore rehearsal, observability, deployment checks and documented incident recovery.
- [ ] End-to-end acceptance across guest order → stock → payment → kitchen → fulfillment → refund/closeout.
- [ ] Permission, concurrent booking/oversell, duplicate webhook, provider timeout, accessibility and device acceptance tests.

## Verification and limits

- Existing unit suite: **10 passed, 0 failed**.
- TypeScript check: **passed** (`npm run typecheck`).
- Anonymous local read checks: orders 401; reservations, notifications and notification templates 200.
- No messages, charges, refunds, AI calls or provider submissions were made during this review.
- Local environment contains OpenRouter, Stripe and Resend settings. Presence does not prove validity or successful operation; values were not printed.
- Database integration tests require an isolated disposable database and were not run in this assessment.
- Production build, full browser journeys and real hardware/provider tests have not been established by this assessment.
- This document records an assessment and backlog. It does not implement the unchecked features.


## Implementation progress — September 6, 2026

Implementation is underway. The original assessment above is retained as the
starting baseline; the changes below supersede the corresponding findings.
Unchecked broad backlog items remain incomplete until their full acceptance
criteria are covered.

Implemented so far:

- Replaced dashboard constants with database-backed activity and receipts grouped by currency; primary timezone/profile support and explicit metric definitions.
- Removed header sample alerts, added server-backed search, and linked settings/profile behavior.
- Added authorization wrappers to 43 operational route files, expanded protected pages, and revalidated active account roles.
- Added restaurant-specific session/CSRF cookies to prevent collisions with other local projects.
- Startup now preserves existing administrator accounts. Staff creation no longer supplies a default password.
- Added bounded operation requests, atomic idempotency receipts and operation audit history.
- Replaced simulated notification timers with a durable email/SMS queue, consent checks, Resend/Twilio sends, verified callbacks and held uncertain outcomes. Sending is disabled unless explicitly enabled in runtime configuration.
- Added a real notification/template UI; legacy messages without receipts are visibly unverified.
- Made loyalty changes atomic, validated, audited and protected against insufficient balance or duplicate requests.
- Added timesheets with own-staff checks, duplicate clock-in prevention, breaks, corrections, independent operation history, approval and approved base-pay CSV export.
- Settings now persist restaurant profile and hours, validate stale edits, and provide password change.
- Added reservation lifecycle gates, stale-version checks, capacity/time conflicts, restaurant-hours validation, history-preserving cancellation and table turnover states.
- Added validated waitlist transitions and protected table configuration; waitlist exits preserve history.
- Retained stable browser request keys across network failures for order/payment actions and reservation mutations.
- Added an AI workspace with 11 draft tasks, evidence snapshots/citations, saved review history, provider receipts/usage, request limits, reported-cost thresholds and cancellation/recovery.
- Added a knowledge library with versioning, independent source approval and approval invalidation after edits.
- Added a reproducible same-weekday demand baseline and historical mean absolute error. It is not a validated production forecast.

Validation checkpoint:

- Production build passed before the most recent AI workspace additions; a final rebuild is still required.
- Unit tests, TypeScript and lint passed at the preceding checkpoint; new AI tests are being added and rerun.
- Real PostgreSQL tests passed in disposable schemas for duplicate mutations, time ownership, provider callbacks, unknown delivery outcomes, reservation conflicts and existing order workflows; schemas were removed afterward.
- Authenticated HTTP login and reads for dashboard, settings, reservations, notifications and timesheets passed.
- No real messages, payments or AI calls were made during implementation.

Additive local migrations applied:
`20260906000000_operations_integrity` and `20260906010000_ai_review`.
A private PostgreSQL backup was created before applying them under
`/Users/erolakarsu/.codex/backups/independentRestaurant/`.

Still incomplete includes full multi-organization/location isolation, complete
POS/split-tender/closeout flows, purchasing and inventory safeguards, payroll
rules/exports, external provider acceptance, native/offline/device integrations,
and the remaining detailed backlog. The AI tasks labeled invoice, staffing and
concierge currently produce reviewable drafts; this does not establish file OCR,
constraint-solving schedules, or an autonomous customer-facing assistant.

### Payment recovery and order validation checkpoint — September 6

- Payment creation now reserves one active attempt per order. A timeout leaves an explicit uncertain outcome and holds further attempts. Retries reuse the original Stripe idempotency key, retrieve an existing checkout URL, and stop automatic creation outside a 23-hour retry window. Creation responses do not establish captured payment.
- Card receipts match the specific attempt metadata or an already known payment reference, plus amount and currency. A failed card entry keeps its checkout held until it is completed or explicitly expired. Signed webhook failures can retry the same event; a stored failed event no longer gets incorrectly acknowledged as successfully processed. Changed event bodies and forged signatures are rejected.
- Refunds now require an original captured receipt, reserve the remaining balance under an order lock, and retain unknown outcomes. Provider refund amount/currency/reference checks, callback reconciliation, terminal-state protection and duplicate handling preserve payment history. Partial refunds retain a cancelled order's status.
- Added an order-detail payment panel for receipts, opening/resuming checkout, provider reference reconciliation, checkout expiration and manager-confirmed original-card refunds. Legacy orders without a matching server pricing/tax receipt require separate reconciliation before charging. This does not implement split tenders or cash closeout.
- Order retry hashes include the actor. Non-managers cannot supply discounts, and required modifier groups enforce minimum/maximum selections.
- Startup now regenerates the Prisma client after migrations. Restarting the local server resolved the stale client behind the AI workspace read failure; the endpoint now returns 200.
- Verification: 15 unit tests passed; 3 PostgreSQL integration scenarios passed in a disposable schema, including order/stock lifecycle, operational permissions/delivery and payment/refund recovery. The payment scenario tests actual Stripe SDK signatures with local fixtures, a failed callback retry, duplicate receipts, wrong currency/reference, uncertain refunds, actor-bound order retries and modifier requirements. TypeScript, lint and production build passed. Authenticated dashboard/orders/AI/finance reads and browser rendering passed; anonymous private reads return 401. The payment panel screenshot was visually inspected.
- No new schema migration was needed for these payment changes. No real payment, refund, message or AI provider request was issued. Real provider accounts, guest ordering, split checks/tenders, drawer closeout, purchasing, device integrations and full release acceptance remain outstanding.

### Full restore rehearsal — September 6

A fresh private custom-format PostgreSQL backup was restored into a disposable local database. Every public table was read, schema constraints were restored, and the restored database had zero invalid indexes. The disposable database was removed afterward. The backup is retained under `/Users/erolakarsu/.codex/backups/` in this project's directory as `restore-verified-*.dump` with owner-only file permissions. This supersedes the earlier archive-catalog-only checkpoint.

`npm run test:restore` repeats the backup and restore rehearsal against the configured local database. This verifies local restoration; off-site storage, retention scheduling, production disaster recovery and broader release acceptance remain separate work.

### Customer pickup ordering checkpoint — September 6

- Added `/order-online` with a public menu, listed allergen information, required modifier choices, current-price/tax quotes, scheduled pickup, explicit total confirmation, customer order history and cancellation before restaurant acceptance.
- Added staff setup at `/online-ordering`: reviewed pickup notice/horizon/request limits and identity-reviewed customer-account provisioning. Ordering remains disabled until an operator explicitly configures hours and tax and enables it. No customer accounts or public ordering settings were enabled during implementation.
- Customer requests use the same pricing and inventory service, stay pending until staff acceptance, and cannot start card payment before acceptance. Customer cancellation is checked under the order lock, so it cannot race past staff acceptance. Stock is restored once on cancellation. Accepted online checkouts return to the customer page.
- Added actor-bound retries, active-account checks, pending-request limits, quote rate limits, customer-only response fields, changed-total rejection and pickup-hour validation. Staff see scheduled pickup times in order cards/details.
- Verification: 15 unit tests and four PostgreSQL scenarios passed with each test file using a separate disposable schema. A production-build browser journey passed quote → confirmed total → pending request → customer cancellation → new request → staff UI acceptance → payment readiness, plus anonymous private-access denial. No payment provider was called. Lint and production build passed.
- Applied additive migration `20260906020000_online_pickup` after private backup `before-online-ordering-1788721408440.dump`. Added `scripts/test-online-browser.cjs` and its Playwright development dependency for a repeatable isolated journey.
- Updated Next.js, React, Auth.js and affected transitive packages. The current `npm audit` reports zero vulnerabilities, and tests/build/browser checks passed after the update. npm 11.19.1 was used to resolve an older npm dependency-resolution failure.
- Remaining customer-ordering scope includes anonymous guest checkout, delivery-provider acceptance, dine-in seat/table ordering, scheduled kitchen capacity, automatic reminders and full production onboarding. This checkpoint completes the authenticated pickup workflow, not the whole restaurant backlog.
