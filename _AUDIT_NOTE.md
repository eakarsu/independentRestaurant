# Audit Apply Notes — independentRestaurant

Source: `_AUDIT/reports/batch_10.md` § Substantive #16 independentRestaurant

## Original audit recommendations

Audit verdict: **SUBSTANTIVE** — 26 pages + 60 API routes. Already covers menu optimization, kitchen optimization, waste reduction, customer segmentation, dynamic pricing, demand forecasting, staff optimization, recipe intelligence, reservation analytics.

### What's missing
- Supplier/vendor management with procurement automation
- Food cost tracking and margin analysis
- Recipe costing with ingredient tracking
- Catering/bulk order management
- Music/ambiance management (Spotify integration)
- Guest flow/wait time prediction
- Real-time kitchen display optimization

### Custom feature ideas
- Voice order-taking
- Recipe cost optimizer
- Waste AI (vision-based food waste tracking)
- Catering agent
- Staff scheduling + mood tracking
- Delivery driver efficiency

## Implemented this pass

**None.** This pass is backlog-only.

Reason: most of the "missing" items are NEEDS-CREDS (Spotify, voice telephony, supplier EDI), NEEDS-SCHEMA (food-cost ledger, recipe-ingredient cost graph, KDS state-machine), or NEEDS-PRODUCT-DECISION (mood-tracking privacy review, catering quote workflow). The codebase already has 60 AI routes including `dynamic-pricing`, `no-show-predictor`, `tip-fairness`, `waste-recipe`, and a `concierge` API; layering more without product clarity would create surface without value.

## Backlog (not implemented)

### Needs creds / external deps
- Music/ambiance (Spotify integration).
- Voice order-taking (Twilio Voice).
- Supplier procurement (EDI / supplier APIs).

### Needs schema/data model work
- Recipe costing — ingredient-price graph + yield/loss factors.
- Food cost tracking & margin analysis — period-close ledger.
- Catering/bulk order management — pricing tiers, lead times, separate workflow.
- Real-time KDS optimization — needs station/state model.

### Needs product decision
- Vision-based food waste tracking — camera vendor + privacy review.
- Mood tracking for staff scheduling — privacy/fairness review.
- Delivery driver efficiency — own drivers vs aggregator integration.

## Categorisation

- MECHANICAL: none safely identified given existing depth.
- NEEDS-CREDS: Spotify, telephony, supplier EDI.
- NEEDS-SCHEMA: recipe costing, food-cost ledger, catering, KDS.
- NEEDS-PRODUCT-DECISION: vision waste, mood tracking, delivery model.

## Apply pass 3 (frontend)

**Action:** LEFT-AS-IS (no pass-2 endpoints to wire).

**Stack:** Next.js App Router (TS) + Prisma + Tailwind. NextAuth-style auth (server-side, no localStorage Bearer needed for same-origin App Router calls).

**Backend AI endpoints surfaced:** ~60 routes under `src/app/api/ai/*` — all pre-existing from before pass 2. Pass 2 was backlog-only (no new endpoints implemented; deferred items are NEEDS-CREDS / NEEDS-SCHEMA / NEEDS-PRODUCT-DECISION).

**Files:** `_AUDIT_NOTE.md` only (this section).

**Syntax check:** N/A.

**Notes:** Pass 2 deliberately did not add endpoints, so there is nothing for pass 3 to wire. The existing 26 frontend pages already exercise the AI surface. Idempotence rule applied.
