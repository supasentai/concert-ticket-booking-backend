# Tradeoffs

## Modular Monolith

- Decision: The backend is a single NestJS application split into modules.
- Benefit: Simple local setup, easy navigation, and direct transactions across features.
- Cost: Independent deployment and scaling per domain is not available.
- Future improvement: Extract payment, notification, or analytics services if operational needs justify it.

## Prisma 7 With Driver Adapter

- Decision: Use Prisma Client generated into `generated/prisma` with `@prisma/adapter-pg`.
- Benefit: Strong typing, migrations, DTO-friendly data access, and Prisma 7 compatibility.
- Cost: Some advanced conditional updates use raw SQL where Prisma query objects cannot express column-to-column comparisons.
- Future improvement: Encapsulate raw SQL in narrower repository helpers if query volume grows.

## PostgreSQL Transactions for Consistency

- Decision: Booking creation and state transitions use database transactions.
- Benefit: Stock, voucher counters, bookings, items, and usage records commit or roll back together.
- Cost: More care is required around transaction-client usage and concurrent conflicts.
- Future improvement: Add bounded retry for serialization/deadlock errors if higher contention appears.

## Conditional Updates Instead of In-Memory Checks

- Decision: Stock and status transitions rely on conditional database updates.
- Benefit: Prevents overselling and duplicate payment/cancellation effects under concurrency.
- Cost: Error handling must interpret affected-row counts and map them to user-facing conflicts.
- Future improvement: Add more explicit domain error codes for clients.

## Booking Snapshots

- Decision: Store booking price and voucher snapshots at booking time.
- Benefit: Later category or voucher changes do not rewrite historical booking totals.
- Cost: More columns exist on `Booking`.
- Future improvement: Add formal invoice/ticket documents if financial reporting expands.

## Usage Counters

- Decision: Maintain `TicketCategory.sold`, `Voucher.usedCount`, and `VoucherUserUsage.usedCount`.
- Benefit: Efficient availability checks and dashboard data.
- Cost: Counter consistency must be protected during cancellation and rollback paths.
- Future improvement: Add periodic integrity checks or database constraints/triggers if needed.

## Synchronous Cancellation Restoration

- Decision: Cancellation restores stock and voucher usage in the request transaction.
- Benefit: The API returns only after the system is consistent.
- Cost: Cancellation latency includes all restoration work.
- Future improvement: Keep synchronous state transition but emit events for non-critical side effects.

## Simulated Payment

- Decision: Use a mock payment endpoint.
- Benefit: Demonstrates booking state transitions without external infrastructure.
- Cost: No provider idempotency keys, webhooks, refunds, or reconciliation.
- Future improvement: Integrate a payment provider and model payment attempts/refunds.

## JWT/RBAC Simplicity

- Decision: Use two roles: `CUSTOMER` and `OPERATOR`.
- Benefit: Easy to reason about and test.
- Cost: No permission granularity between operators.
- Future improvement: Add permission scopes or admin/operator subroles.

## Request-Time Dashboard Aggregation

- Decision: Dashboard summary is aggregated from live transactional tables.
- Benefit: Always reflects current data and avoids maintaining projections.
- Cost: May become expensive at high scale.
- Future improvement: Add cached read models, materialized views, or async analytics projections.

## Mermaid Documentation

- Decision: Store diagrams as Mermaid Markdown.
- Benefit: Version-controlled, reviewable, and GitHub-renderable.
- Cost: Less visually polished than hand-designed diagrams.
- Future improvement: Generate diagram images during release documentation if needed.

## Seed Data

- Decision: Seed creates demo accounts, concerts, categories, vouchers, and representative bookings.
- Benefit: Reviewers can quickly exercise Swagger/Postman and dashboard endpoints.
- Cost: Seed data is demo-oriented and not production data.
- Future improvement: Split demo seed from production bootstrap if deployment needs diverge.

## Strict DTO Validation

- Decision: Global validation strips unknown fields and rejects non-whitelisted input.
- Benefit: Protects calculated fields such as totals, sold counts, roles, and snapshots.
- Cost: Clients must stay aligned with DTO schemas.
- Future improvement: Publish generated OpenAPI clients for consumers.
