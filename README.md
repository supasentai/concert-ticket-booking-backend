# Concert Ticket Booking Backend

NestJS backend for the Concert Ticket Booking home-test project.

## Requirements

- Node.js 22+
- npm
- Docker and Docker Compose

## Environment

Create a local `.env` from the example:

```bash
cp .env.example .env
```

The example uses placeholder PostgreSQL credentials and authentication secrets. Update `.env` for your local machine if needed. Do not commit `.env`.

Required authentication variables:

```env
JWT_ACCESS_SECRET=replace-with-a-secure-access-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace-with-a-secure-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

SEED_OPERATOR_EMAIL=operator@example.com
SEED_OPERATOR_PASSWORD=replace-with-a-secure-password
SEED_OPERATOR_FULL_NAME=System Operator
```

## Local Setup

Start PostgreSQL:

```bash
docker compose up -d
```

Install dependencies:

```bash
npm ci
```

Generate Prisma Client and apply migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

Create or update the seeded operator account:

```bash
npx prisma db seed
```

Start the API:

```bash
npm run start:dev
```

The API listens on the configured `PORT` value, defaulting to `3000`.

## Useful URLs

- Health check: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/api/docs`

## Authentication

Public endpoints:

- `POST /auth/register` creates a `CUSTOMER` account. The request body does not accept a role.
- `POST /auth/login` returns an access token and refresh token.
- `POST /auth/refresh` rotates a valid refresh token and invalidates the previous refresh token.

Authenticated endpoints:

- `POST /auth/logout` invalidates the current user's refresh token.
- `GET /users/me` returns the authenticated user.
- `GET /users` lists users and requires the `OPERATOR` role.

Use the access token as a bearer token:

```http
Authorization: Bearer <access-token>
```

Roles:

- `CUSTOMER`: default role for public registration.
- `OPERATOR`: seeded administrative role for operator-only APIs.

Refresh tokens are stored as hashes and rotated on every refresh. Reusing an old refresh token returns `401 Unauthorized`.

## Phase 02: Concert Management

Phase 02 adds concert and ticket category management.

Operator APIs require a bearer token for an `OPERATOR` account:

- `POST /operator/concerts`
- `GET /operator/concerts`
- `GET /operator/concerts/:id`
- `PATCH /operator/concerts/:id`
- `DELETE /operator/concerts/:id`
- `PATCH /operator/concerts/:id/publish`
- `POST /operator/concerts/:concertId/ticket-categories`
- `GET /operator/concerts/:concertId/ticket-categories`
- `GET /operator/concerts/:concertId/ticket-categories/:categoryId`
- `PATCH /operator/concerts/:concertId/ticket-categories/:categoryId`
- `DELETE /operator/concerts/:concertId/ticket-categories/:categoryId`

Public APIs do not require authentication:

- `GET /concerts`
- `GET /concerts/:id`

The supported concert lifecycle is currently:

- `DRAFT`: operator can edit concerts and ticket categories.
- `PUBLISHED`: public users can browse and view details.

Cancellation and unpublish flows are not implemented.

Local demonstration flow:

1. Seed the operator and demo concerts with `npx prisma db seed`.
2. Login with the seeded operator account.
3. Create a draft concert with `POST /operator/concerts`.
4. Create ticket categories under the concert.
5. Publish the concert with `PATCH /operator/concerts/:id/publish`.
6. Browse published concerts with `GET /concerts`.

Swagger is available at `http://localhost:3000/api/docs`. Apply migrations with `npx prisma migrate deploy` for a local database that should not create new development migrations.

## Phase 03: Booking Workflow

Customer booking APIs require a bearer token for a `CUSTOMER` account:

- `POST /bookings`
- `GET /bookings/me`
- `GET /bookings/:id`
- `POST /bookings/:id/pay`
- `POST /bookings/:id/cancel`

Creating a booking reserves tickets atomically and creates a `PENDING` booking. Mock payment with `{ "success": true }` changes a pending booking to `PAID`; mock payment with `{ "success": false }` changes it to `CANCELLED` and restores the reserved tickets. Repeated payment or cancellation attempts return `409 Conflict`.

## Voucher Management

Phase 04 adds operator voucher management, customer voucher validation preview, and transaction-safe voucher application during booking.

Features:

- Operator voucher CRUD with bearer authentication and `OPERATOR` role checks.
- Voucher code normalization.
- Percentage and fixed-amount discounts.
- Start and expiration time boundaries.
- Minimum order amount.
- Maximum discount cap for percentage vouchers.
- Global usage limit and derived remaining quantity.
- Per-user usage limit.
- Read-only validation preview.
- Transaction-safe voucher application during `POST /bookings`.
- Cancellation restoration for pending bookings.
- Immutable booking price and voucher snapshots.

Voucher lifecycle is derived from configuration and usage:

```text
Created / Scheduled
-> Active
-> Applied to pending booking
-> Paid: usage remains consumed
-> Pending booking cancelled: usage is released
-> Expired / Inactive / Exhausted
```

Voucher time validity uses this boundary:

```text
startsAt <= now < expiresAt
```

Counter semantics:

- `Voucher.usedCount` is the number of voucher usages currently `APPLIED` and not released.
- `VoucherUserUsage.usedCount` is the number of active usages for one customer and voucher.
- `remainingQuantity` is `usageLimit - usedCount` for limited vouchers.
- `remainingQuantity` is `null` for unlimited vouchers.

Discount formulas:

```text
Percentage:
rawDiscount = subtotal * percentage / 100
discountAmount = min(rawDiscount, maximumDiscountAmount if configured)

Fixed:
discountAmount = min(fixedAmount, subtotal)

Final:
totalAmount = max(subtotal - discountAmount, 0)
```

When a customer creates a booking with a voucher, ticket reservation, voucher revalidation, global counter consumption, per-user counter consumption, booking creation, booking item creation, and `VoucherUsage` creation all run in the same database transaction. The validation preview endpoint is read-only; it does not reserve inventory or guarantee the voucher will still be available when the booking is later created.

Cancelling a pending booking restores ticket inventory. If the booking used a voucher, its usage moves from `APPLIED` to `RELEASED`, and the global and per-user counters are decremented exactly once. Paid bookings keep the voucher consumed.

Demo vouchers seeded by `npx prisma db seed`:

| Code             | Type         | Key rule                         |
| ---------------- | ------------ | -------------------------------- |
| `SAVE10`         | Percentage   | Active 10% discount              |
| `LESS50000`      | Fixed amount | Fixed 50,000 discount            |
| `SAVE20MAX100K`  | Percentage   | Maximum discount 100,000         |
| `MIN300K`        | Percentage   | Minimum subtotal 300,000         |
| `LIMITED2`       | Percentage   | Two total active usages          |
| `ONCEPERUSER`    | Percentage   | One active usage per customer    |
| `INACTIVE10`     | Percentage   | Inactive                         |
| `EXPIRED10`      | Percentage   | Expired                          |
| `FUTURE10`       | Percentage   | Scheduled for the future         |

Operator create voucher example:

```http
POST /vouchers
Authorization: Bearer <operator-access-token>
Content-Type: application/json
```

```json
{
  "code": "SAVE10",
  "description": "10% discount",
  "discountType": "PERCENTAGE",
  "discountValue": "10.00",
  "startsAt": "2026-01-01T00:00:00.000Z",
  "expiresAt": "2035-12-31T23:59:59.999Z",
  "isActive": true,
  "usageLimit": null,
  "perUserUsageLimit": 1
}
```

Validate voucher example:

```http
POST /vouchers/validate
Authorization: Bearer <customer-access-token>
Content-Type: application/json
```

```json
{
  "code": "SAVE10",
  "concertId": "<concert-uuid>",
  "items": [
    {
      "ticketCategoryId": "<ticket-category-uuid>",
      "quantity": 2
    }
  ]
}
```

Response:

```json
{
  "code": "SAVE10",
  "discountType": "PERCENTAGE",
  "discountValue": "10",
  "maximumDiscountAmount": null,
  "minimumOrderAmount": null,
  "subtotal": "500000",
  "discountAmount": "50000",
  "finalAmount": "450000",
  "remainingQuantity": null,
  "remainingUserUsage": 1,
  "expiresAt": "2035-12-31T23:59:59.999Z"
}
```

Create booking with voucher example:

```http
POST /bookings
Authorization: Bearer <customer-access-token>
Content-Type: application/json
```

```json
{
  "concertId": "<concert-uuid>",
  "ticketCategoryId": "<ticket-category-uuid>",
  "quantity": 2,
  "voucherCode": "SAVE10"
}
```

`voucherCode` is optional; bookings without a voucher keep `discountAmount` at zero and all voucher fields as `null`.

## Verification

```bash
npx prisma validate
npx prisma migrate status
npm run format:check
npm run lint:check
npm test -- --runInBand
npm run test:e2e
npm run build
```

Run the production build locally:

```bash
npm run start:prod
```

## Docker

Build the application image:

```bash
docker build -t concert-ticket-booking-backend .
```

When running the image manually, pass a `DATABASE_URL` that is reachable from inside the container. If using the Compose network, use the PostgreSQL service name `postgres` as the host.
