# Assumptions

## Booking Shape

The current booking API creates one booking item per request: one concert, one ticket category, and one quantity. The database supports multiple booking items, but the public request DTO currently exposes only `concertId`, `ticketCategoryId`, `quantity`, and optional `voucherCode`.

Practical consequence: cart-style multi-category checkout is a future extension.

## Payment

Payment is simulated through `POST /bookings/:id/pay` with `{ "success": true | false }`. There is no external payment provider, webhook verification, settlement, or refund integration.

Practical consequence: `PAID` means the mock transition succeeded, not that a real provider captured funds.

## Booking Expiration

There is no scheduled expiration job for stale pending bookings.

Practical consequence: pending bookings remain reserved until paid, cancelled, or manually transitioned by an operator.

## Currency and Money

Money uses `Decimal(12,2)` and API responses serialize decimals as strings. Seed voucher examples use large values such as `50000`, implying a currency with no explicit symbol in the API.

Practical consequence: clients should display currency according to product configuration outside this backend.

## Timezone

Date/time fields are sent as ISO datetime strings and stored as Prisma `DateTime`. Voucher validity is `startsAt <= now < expiresAt`.

Practical consequence: clients should send timezone-aware ISO strings, ideally UTC.

## Authorization Model

The app uses internal JWT authentication and RBAC. There is no external identity provider, SSO, or fine-grained permission model.

Practical consequence: `OPERATOR` is trusted to manage concerts, categories, vouchers, users, and booking status.

## Ticketing Scope

Seat allocation, QR-code generation, ticket delivery, check-in, and notifications are outside the current scope.

Practical consequence: a paid booking is the current source of truth for a purchased ticket quantity.

## Refunds

`PAID -> CANCELLED` is not supported because refund behavior is not modeled.

Practical consequence: operators cannot cancel paid bookings through the current status endpoint.

## Analytics

Dashboard metrics are computed from transactional tables at request time.

Practical consequence: no reporting warehouse or cached projection exists; large-scale analytics would need a future read model.

## Deletion

The project uses hard deletes where allowed by business rules. History-bearing entities such as used vouchers or booked concerts are protected by restrictions and service checks.

Practical consequence: deleting unused setup data is possible; deleting history is intentionally constrained.

## Pagination

Pagination defaults generally use `page = 1` and `limit = 20`, with a maximum limit of `100`.

Practical consequence: clients should page through dashboard and management lists instead of requesting all data.

## Voucher Codes

Voucher codes are trimmed and uppercased before storage and lookup.

Practical consequence: `save10`, `SAVE10`, and `SAVE10` refer to the same voucher code.
