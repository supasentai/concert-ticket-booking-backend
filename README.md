# Concert Ticket Booking Backend

NestJS backend for a concert ticket booking system. The API supports public concert browsing, customer authentication and bookings, operator-managed concerts/ticket categories/vouchers, and operator dashboard monitoring.

## Project Overview

The system has three user groups:

- Anonymous visitors browse published concerts and register/login.
- Customers create bookings, apply vouchers, pay through a mock payment flow, cancel pending bookings, and view their own bookings.
- Operators manage concerts, ticket categories, vouchers, users, bookings, and dashboard metrics.

Current backend scope includes local PostgreSQL persistence, JWT authentication, role-based access control, Swagger/OpenAPI documentation, seed data, tests, and Docker image support. External payment gateways, ticket delivery, seat allocation, notifications, and refund processing are outside the current scope.

## Technology Stack

- NestJS 11
- TypeScript 5
- PostgreSQL 16 via Docker Compose
- Prisma ORM 7.9 with the `prisma-client` generator and `@prisma/adapter-pg`
- JWT authentication with Passport
- Swagger/OpenAPI via `@nestjs/swagger`
- Docker and Docker Compose
- Jest and Supertest
- ESLint and Prettier

## Main Features

- Health check with database reachability: `GET /health`
- Customer registration, login, refresh-token rotation, and logout
- Access/refresh tokens with separate secrets and expiration settings
- Role-based access control for `CUSTOMER` and `OPERATOR`
- Operator concert CRUD and publishing
- Operator ticket category CRUD
- Public published-concert browsing
- Customer booking workflow with atomic ticket reservation
- Mock payment and cancellation transitions
- Overselling protection with database conditional updates
- Immutable booking price snapshots
- Operator voucher CRUD and customer voucher preview
- Voucher application inside the booking transaction
- Global and per-user voucher usage limits
- Voucher restoration on pending booking cancellation
- Operator dashboard summary
- Operator booking monitoring and status transitions

## Roles and Permissions

| Capability                   | Anonymous | Customer | Operator |
| ---------------------------- | --------- | -------- | -------- |
| Health check                 | Yes       | Yes      | Yes      |
| Swagger UI                   | Yes       | Yes      | Yes      |
| Register/login/refresh       | Yes       | Yes      | Yes      |
| Browse published concerts    | Yes       | Yes      | Yes      |
| Create and view own bookings | No        | Yes      | No       |
| Pay/cancel own bookings      | No        | Yes      | No       |
| Validate vouchers            | No        | Yes      | No       |
| Manage concerts/categories   | No        | No       | Yes      |
| Manage vouchers              | No        | No       | Yes      |
| List users                   | No        | No       | Yes      |
| Dashboard summary            | No        | No       | Yes      |
| Monitor/update bookings      | No        | No       | Yes      |

Authentication failures return `401 Unauthorized`. Authenticated users without the required role receive `403 Forbidden`.

## Project Structure

```text
src/
  auth/                 JWT auth, refresh rotation, guards, role decorators
  bookings/             Customer booking workflow and operator booking monitoring
  common/prisma/        PrismaService with PostgreSQL driver adapter
  concerts/             Operator and public concert APIs
  dashboard/            Operator summary metrics
  ticket-categories/    Operator ticket category APIs
  users/                Current-user and operator user APIs
  vouchers/             Voucher CRUD and validation preview
prisma/
  schema.prisma         Prisma schema
  seed.ts               Idempotent local demo seed
  migrations/           Versioned database migrations
docs/                   Architecture, ERD, sequence diagrams, assumptions, tradeoffs
test/                   Supertest e2e suite
```

## Environment Configuration

Create a local `.env` from the template:

```powershell
Copy-Item .env.example .env
```

Required variables from `.env.example`:

| Variable                  | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`                | Runtime environment, usually `development`, `test`, or `production` |
| `PORT`                    | API port, default `3000`                                            |
| `POSTGRES_USER`           | Local Compose PostgreSQL user                                       |
| `POSTGRES_PASSWORD`       | Local Compose PostgreSQL password                                   |
| `POSTGRES_DB`             | Local Compose PostgreSQL database                                   |
| `POSTGRES_PORT`           | Host port mapped to PostgreSQL container port `5432`                |
| `DATABASE_URL`            | PostgreSQL connection string used by Prisma and the app             |
| `JWT_ACCESS_SECRET`       | Access-token signing secret, minimum 32 chars                       |
| `JWT_ACCESS_EXPIRES_IN`   | Access-token lifetime, for example `15m`                            |
| `JWT_REFRESH_SECRET`      | Refresh-token signing secret, must differ from access secret        |
| `JWT_REFRESH_EXPIRES_IN`  | Refresh-token lifetime, must differ from access expiry              |
| `SEED_OPERATOR_EMAIL`     | Operator account email created by seed                              |
| `SEED_OPERATOR_PASSWORD`  | Operator account password created by seed                           |
| `SEED_OPERATOR_FULL_NAME` | Operator display name created/updated by seed                       |

Never commit `.env` or real credentials.

## Local Setup

Install dependencies:

```powershell
npm ci
```

Start PostgreSQL:

```powershell
docker compose up -d
```

Generate Prisma Client and apply migrations:

```powershell
npx prisma generate
npx prisma migrate deploy
```

Seed demo data:

```powershell
npx prisma db seed
```

Start development mode:

```powershell
npm run start:dev
```

The API listens on `http://localhost:3000` unless `PORT` is changed.

## Docker Setup

The repository includes:

- `compose.yaml` for local PostgreSQL.
- `Dockerfile` for the NestJS API image.
- `.dockerignore` for container build hygiene.

Build the API image:

```powershell
docker build -t concert-ticket-booking-backend .
```

When running the image manually, pass a `DATABASE_URL` reachable from inside the container. If running on the Compose network, use the PostgreSQL service name `postgres` as the host.

## Testing and Quality Checks

```powershell
npm run format
npm run format:check
npm run lint
npm run lint:check
npm test
npm run test:e2e
npm run build
npx prisma validate
npx prisma migrate status
```

## API Documentation

Swagger UI is available at:

```text
http://localhost:3000/api/docs
```

Protected endpoints use bearer authentication:

```http
Authorization: Bearer <access-token>
```

In Swagger, click **Authorize** and paste a customer or operator access token.

## Demo Accounts and Seed Data

`npx prisma db seed` is idempotent and does not reset the database. It creates or updates:

- Operator account from `SEED_OPERATOR_EMAIL`, `SEED_OPERATOR_PASSWORD`, and `SEED_OPERATOR_FULL_NAME`.
- Demo customer account:
  - Email: `demo-customer@example.com`
  - Password: `Password123`
- Demo concerts:
  - `Demo Published Future Concert`
  - `Demo Draft Concert`
  - `Demo Ended Published Concert`
- Demo ticket categories for the concerts.
- Demo bookings for dashboard monitoring: one pending, one paid, and one cancelled booking where missing.
- Demo vouchers:

| Code            | Type         | Key rule                      |
| --------------- | ------------ | ----------------------------- |
| `SAVE10`        | Percentage   | Active 10% discount           |
| `LESS50000`     | Fixed amount | Fixed 50,000 discount         |
| `SAVE20MAX100K` | Percentage   | Maximum discount 100,000      |
| `MIN300K`       | Percentage   | Minimum subtotal 300,000      |
| `LIMITED2`      | Percentage   | Two total active usages       |
| `ONCEPERUSER`   | Percentage   | One active usage per customer |
| `INACTIVE10`    | Percentage   | Inactive                      |
| `EXPIRED10`     | Percentage   | Expired                       |
| `FUTURE10`      | Percentage   | Scheduled for the future      |

The seed intentionally does not overwrite an existing operator password, does not promote an existing customer to operator, does not reset voucher counters, and does not delete bookings or usage history.

## API Overview

### Health

- `GET /health`

### Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Users

- `GET /users/me`
- `GET /users` (`OPERATOR`)

### Public Concerts

- `GET /concerts`
- `GET /concerts/:id`

### Customer Bookings

- `POST /bookings`
- `GET /bookings/me`
- `GET /bookings/:id`
- `POST /bookings/:id/pay`
- `POST /bookings/:id/cancel`

### Operator Concerts and Ticket Categories

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

### Vouchers

- `POST /vouchers` (`OPERATOR`)
- `GET /vouchers` (`OPERATOR`)
- `GET /vouchers/:id` (`OPERATOR`)
- `PATCH /vouchers/:id` (`OPERATOR`)
- `DELETE /vouchers/:id` (`OPERATOR`)
- `POST /vouchers/validate` (`CUSTOMER`)

### Operator Dashboard and Booking Monitoring

- `GET /operator/dashboard/summary`
- `GET /operator/bookings`
- `GET /operator/bookings/:id`
- `PATCH /operator/bookings/:id/status`

## Core Business Rules

- Public concert APIs show only published, non-ended concerts.
- Operators can edit/delete only draft concerts.
- Publishing requires at least one active ticket category.
- Public registration always creates `CUSTOMER`.
- Password hashes and refresh-token hashes are never returned by API responses.
- Bookings are currently created with one ticket category per request.
- Booking creation runs in a transaction.
- Ticket inventory uses atomic conditional updates; overselling is not allowed.
- Booking item prices, booking totals, and voucher configuration snapshots are immutable after booking creation.
- Mock payment supports `PENDING -> PAID` and failed payment as `PENDING -> CANCELLED`.
- Cancellation supports `PENDING -> CANCELLED`; duplicate cancellation returns `409 Conflict`.
- Operator status update supports only `PENDING -> PAID` and `PENDING -> CANCELLED`.
- Cancelling a pending booking restores ticket stock and releases voucher usage exactly once.
- Paid bookings keep ticket inventory and voucher usage consumed.
- Voucher preview is read-only and does not reserve inventory or voucher usage.
- Voucher code matching is case-normalized.
- Decimal money values are serialized as strings.

## Documentation Links

- [Architecture](docs/ARCHITECTURE.md)
- [ERD](docs/ERD.md)
- [Sequence diagrams](docs/SEQUENCE_DIAGRAMS.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Tradeoffs](docs/TRADEOFFS.md)
- [Postman collection](docs/postman/Concert-Ticket-Booking-API.postman_collection.json)
- [Postman local environment](docs/postman/Local.postman_environment.json)
- Swagger UI: `http://localhost:3000/api/docs`
