# Entity Relationship Diagram

```mermaid
erDiagram
  User ||--o{ Concert : creates
  User ||--o{ Booking : makes
  User ||--o{ VoucherUsage : uses
  User ||--o{ VoucherUserUsage : has_counter
  Concert ||--o{ TicketCategory : has
  Concert ||--o{ Booking : booked_for
  TicketCategory ||--o{ BookingItem : selected_as
  Booking ||--o{ BookingItem : contains
  Voucher ||--o{ Booking : snapshotted_on
  Voucher ||--o{ VoucherUsage : records
  Voucher ||--o{ VoucherUserUsage : counts
  Booking ||--o| VoucherUsage : has

  User {
    string id PK
    string email UK
    string passwordHash
    string fullName
    string role
    string refreshTokenHash
    datetime createdAt
    datetime updatedAt
  }

  Concert {
    string id PK
    string title
    string venue
    datetime startTime
    datetime endTime
    string status
    datetime publishedAt
    string createdById FK
    datetime createdAt
    datetime updatedAt
  }

  TicketCategory {
    string id PK
    string concertId FK
    string name
    decimal price
    int quantity
    int sold
    boolean isActive
    datetime createdAt
    datetime updatedAt
  }

  Booking {
    string id PK
    string userId FK
    string concertId FK
    string status
    decimal subtotal
    decimal discountAmount
    decimal totalAmount
    string voucherId FK
    string voucherCodeSnapshot
    string voucherDiscountTypeSnapshot
    decimal voucherDiscountValueSnapshot
    decimal voucherMaximumDiscountAmountSnapshot
    datetime createdAt
    datetime updatedAt
  }

  BookingItem {
    string id PK
    string bookingId FK
    string ticketCategoryId FK
    int quantity
    decimal unitPrice
    decimal lineTotal
    datetime createdAt
  }

  Voucher {
    string id PK
    string code UK
    string discountType
    decimal discountValue
    decimal maximumDiscountAmount
    decimal minimumOrderAmount
    datetime startsAt
    datetime expiresAt
    boolean isActive
    int usageLimit
    int usedCount
    int perUserUsageLimit
    datetime createdAt
    datetime updatedAt
  }

  VoucherUsage {
    string id PK
    string voucherId FK
    string userId FK
    string bookingId FK
    string status
    datetime createdAt
    datetime releasedAt
  }

  VoucherUserUsage {
    string id PK
    string voucherId FK
    string userId FK
    int usedCount
    datetime createdAt
    datetime updatedAt
  }

  HealthRecord {
    string id PK
    datetime createdAt
  }
```

## Notes

- Most business entities use UUID string IDs. `HealthRecord` uses `cuid()` and exists from the initial bootstrap phase.
- Money fields use PostgreSQL `Decimal(12,2)` through Prisma and are serialized as strings in API responses.
- `TicketCategory.sold` tracks reserved/paid tickets currently held by non-cancelled bookings.
- `BookingItem.unitPrice`, `BookingItem.lineTotal`, `Booking.subtotal`, `Booking.discountAmount`, and `Booking.totalAmount` are immutable booking-time snapshots.
- Voucher snapshots on `Booking` preserve code, discount type, discount value, and maximum discount at booking time.
- `Voucher.usedCount` is the number of active `APPLIED` voucher usages.
- `VoucherUserUsage.usedCount` is the active usage count for one user and voucher.
- `VoucherUsage.bookingId` is unique, so one booking can have at most one voucher usage record.
- `TicketCategory` is unique by `(concertId, name)`.
- `VoucherUserUsage` is unique by `(voucherId, userId)`.
- Concert deletion cascades to ticket categories, but booking relationships restrict deletion where history exists.
- Voucher, user, booking, and ticket-category history uses restrictive foreign keys where needed to preserve auditability.
