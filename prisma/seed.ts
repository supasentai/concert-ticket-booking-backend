import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  ConcertStatus,
  Prisma,
  PrismaClient,
  Role,
  VoucherDiscountType,
} from '../generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for seeding');
}

const operatorEmail = process.env.SEED_OPERATOR_EMAIL?.trim().toLowerCase();
const operatorPassword = process.env.SEED_OPERATOR_PASSWORD;
const operatorFullName = process.env.SEED_OPERATOR_FULL_NAME?.trim();

if (!operatorEmail || !operatorPassword || !operatorFullName) {
  throw new Error(
    'SEED_OPERATOR_EMAIL, SEED_OPERATOR_PASSWORD, and SEED_OPERATOR_FULL_NAME are required for seeding',
  );
}

const seedOperatorEmail = operatorEmail;
const seedOperatorPassword = operatorPassword;
const seedOperatorFullName = operatorFullName;

const demoPublishedTitle = 'Demo Published Future Concert';
const demoDraftTitle = 'Demo Draft Concert';
const demoEndedTitle = 'Demo Ended Published Concert';
const demoCustomerEmail = 'demo-customer@example.com';
const demoCustomerPassword = 'Password123';
const demoCustomerFullName = 'Demo Customer';

const activeVoucherStartsAt = new Date('2026-01-01T00:00:00.000Z');
const activeVoucherExpiresAt = new Date('2035-12-31T23:59:59.999Z');
const expiredVoucherStartsAt = new Date('2025-01-01T00:00:00.000Z');
const expiredVoucherExpiresAt = new Date('2025-12-31T23:59:59.999Z');
const futureVoucherStartsAt = new Date('2036-01-01T00:00:00.000Z');
const futureVoucherExpiresAt = new Date('2036-12-31T23:59:59.999Z');

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    let operator = await prisma.user.findUnique({
      where: { email: seedOperatorEmail },
      select: { id: true, role: true },
    });

    if (operator) {
      if (operator.role !== Role.OPERATOR) {
        throw new Error(
          `Seed email ${seedOperatorEmail} already belongs to a non-operator user`,
        );
      }

      operator = await prisma.user.update({
        where: { email: seedOperatorEmail },
        data: {
          fullName: seedOperatorFullName,
        },
        select: { id: true, role: true },
      });
    } else {
      operator = await prisma.user.create({
        data: {
          email: seedOperatorEmail,
          passwordHash: await bcrypt.hash(seedOperatorPassword, 12),
          fullName: seedOperatorFullName,
          role: Role.OPERATOR,
        },
        select: { id: true, role: true },
      });
    }

    const publishedConcert = await seedDemoConcerts(prisma, operator.id);
    await seedDemoVouchers(prisma);
    await seedDemoBookings(prisma, publishedConcert.id);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDemoConcerts(
  prisma: PrismaClient,
  operatorId: string,
): Promise<{ id: string }> {
  const publishedConcert = await upsertConcertByTitle(prisma, demoPublishedTitle, {
    description: 'Seeded published concert for local browsing demos.',
    venue: 'Demo Arena',
    address: '100 Demo Avenue',
    startTime: new Date('2030-08-01T19:00:00.000Z'),
    endTime: new Date('2030-08-01T22:00:00.000Z'),
    saleStartAt: new Date('2030-07-01T00:00:00.000Z'),
    saleEndAt: new Date('2030-08-01T18:00:00.000Z'),
    posterUrl: 'https://example.com/demo-published-concert.jpg',
    status: ConcertStatus.PUBLISHED,
    publishedAt: new Date('2030-07-01T00:00:00.000Z'),
    createdById: operatorId,
  });

  await upsertTicketCategory(prisma, publishedConcert.id, 'General Admission', {
    description: 'Seeded active general admission category.',
    price: 49.99,
    quantity: 500,
    isActive: true,
  });
  await upsertTicketCategory(prisma, publishedConcert.id, 'VIP', {
    description: 'Seeded active VIP category.',
    price: 129.99,
    quantity: 100,
    isActive: true,
  });
  await upsertTicketCategory(prisma, publishedConcert.id, 'Archived Early Bird', {
    description: 'Seeded inactive category hidden from public details.',
    price: 29.99,
    quantity: 50,
    isActive: false,
  });

  const draftConcert = await upsertConcertByTitle(prisma, demoDraftTitle, {
    description: 'Seeded draft concert for operator workflow demos.',
    venue: 'Draft Hall',
    address: '200 Draft Street',
    startTime: new Date('2030-09-01T19:00:00.000Z'),
    endTime: new Date('2030-09-01T22:00:00.000Z'),
    saleStartAt: new Date('2030-08-01T00:00:00.000Z'),
    saleEndAt: new Date('2030-09-01T18:00:00.000Z'),
    posterUrl: 'https://example.com/demo-draft-concert.jpg',
    status: ConcertStatus.DRAFT,
    publishedAt: null,
    createdById: operatorId,
  });

  await upsertTicketCategory(prisma, draftConcert.id, 'Draft General Admission', {
    description: 'Seeded draft concert ticket category.',
    price: 39.99,
    quantity: 300,
    isActive: true,
  });

  const endedConcert = await upsertConcertByTitle(prisma, demoEndedTitle, {
    description: 'Seeded ended concert for public filtering demos.',
    venue: 'Past Arena',
    address: '300 Past Road',
    startTime: new Date('2026-01-01T19:00:00.000Z'),
    endTime: new Date('2026-01-01T22:00:00.000Z'),
    saleStartAt: new Date('2025-12-01T00:00:00.000Z'),
    saleEndAt: new Date('2026-01-01T18:00:00.000Z'),
    posterUrl: 'https://example.com/demo-ended-concert.jpg',
    status: ConcertStatus.PUBLISHED,
    publishedAt: new Date('2025-12-01T00:00:00.000Z'),
    createdById: operatorId,
  });

  await upsertTicketCategory(prisma, endedConcert.id, 'Ended General Admission', {
    description: 'Seeded ended concert ticket category.',
    price: 19.99,
    quantity: 200,
    isActive: true,
  });

  return publishedConcert;
}

async function seedDemoVouchers(prisma: PrismaClient): Promise<void> {
  await upsertVoucherByCode(prisma, {
    code: 'SAVE10',
    description: 'Demo active 10% percentage voucher.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '10.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: null,
    startsAt: activeVoucherStartsAt,
    expiresAt: activeVoucherExpiresAt,
    isActive: true,
    usageLimit: null,
    perUserUsageLimit: 5,
  });
  await upsertVoucherByCode(prisma, {
    code: 'LESS50000',
    description: 'Demo active fixed 50,000 discount voucher.',
    discountType: VoucherDiscountType.FIXED_AMOUNT,
    discountValue: '50000.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: null,
    startsAt: activeVoucherStartsAt,
    expiresAt: activeVoucherExpiresAt,
    isActive: true,
    usageLimit: null,
    perUserUsageLimit: 5,
  });
  await upsertVoucherByCode(prisma, {
    code: 'SAVE20MAX100K',
    description: 'Demo active 20% voucher capped at 100,000.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '20.00',
    maximumDiscountAmount: '100000.00',
    minimumOrderAmount: null,
    startsAt: activeVoucherStartsAt,
    expiresAt: activeVoucherExpiresAt,
    isActive: true,
    usageLimit: null,
    perUserUsageLimit: 5,
  });
  await upsertVoucherByCode(prisma, {
    code: 'MIN300K',
    description: 'Demo voucher requiring a minimum subtotal of 300,000.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '15.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: '300000.00',
    startsAt: activeVoucherStartsAt,
    expiresAt: activeVoucherExpiresAt,
    isActive: true,
    usageLimit: null,
    perUserUsageLimit: 5,
  });
  await upsertVoucherByCode(prisma, {
    code: 'LIMITED2',
    description: 'Demo voucher with two total active usages.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '10.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: null,
    startsAt: activeVoucherStartsAt,
    expiresAt: activeVoucherExpiresAt,
    isActive: true,
    usageLimit: 2,
    perUserUsageLimit: 1,
  });
  await upsertVoucherByCode(prisma, {
    code: 'ONCEPERUSER',
    description: 'Demo voucher limited to one active usage per customer.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '10.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: null,
    startsAt: activeVoucherStartsAt,
    expiresAt: activeVoucherExpiresAt,
    isActive: true,
    usageLimit: 100,
    perUserUsageLimit: 1,
  });
  await upsertVoucherByCode(prisma, {
    code: 'INACTIVE10',
    description: 'Demo inactive 10% voucher.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '10.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: null,
    startsAt: activeVoucherStartsAt,
    expiresAt: activeVoucherExpiresAt,
    isActive: false,
    usageLimit: null,
    perUserUsageLimit: 5,
  });
  await upsertVoucherByCode(prisma, {
    code: 'EXPIRED10',
    description: 'Demo expired 10% voucher.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '10.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: null,
    startsAt: expiredVoucherStartsAt,
    expiresAt: expiredVoucherExpiresAt,
    isActive: true,
    usageLimit: null,
    perUserUsageLimit: 5,
  });
  await upsertVoucherByCode(prisma, {
    code: 'FUTURE10',
    description: 'Demo scheduled 10% voucher.',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: '10.00',
    maximumDiscountAmount: null,
    minimumOrderAmount: null,
    startsAt: futureVoucherStartsAt,
    expiresAt: futureVoucherExpiresAt,
    isActive: true,
    usageLimit: null,
    perUserUsageLimit: 5,
  });
}

async function upsertConcertByTitle(
  prisma: PrismaClient,
  title: string,
  data: {
    description: string;
    venue: string;
    address: string;
    startTime: Date;
    endTime: Date;
    saleStartAt: Date;
    saleEndAt: Date;
    posterUrl: string;
    status: ConcertStatus;
    publishedAt: Date | null;
    createdById: string;
  },
): Promise<{ id: string }> {
  const existing = await prisma.concert.findFirst({
    where: { title },
    select: { id: true },
  });

  if (existing) {
    return prisma.concert.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }

  return prisma.concert.create({
    data: {
      title,
      ...data,
    },
    select: { id: true },
  });
}

async function upsertTicketCategory(
  prisma: PrismaClient,
  concertId: string,
  name: string,
  data: {
    description: string;
    price: number;
    quantity: number;
    isActive: boolean;
  },
): Promise<void> {
  await prisma.ticketCategory.upsert({
    where: {
      concertId_name: {
        concertId,
        name,
      },
    },
    create: {
      concertId,
      name,
      sold: 0,
      ...data,
    },
    update: data,
  });
}

async function seedDemoBookings(
  prisma: PrismaClient,
  concertId: string,
): Promise<void> {
  const customer = await upsertDemoCustomer(prisma);
  const existingStatusCounts = await prisma.booking.groupBy({
    by: ['status'],
    where: {
      userId: customer.id,
      concertId,
    },
    _count: { status: true },
  });
  const hasStatus = new Set(
    existingStatusCounts
      .filter((item) => item._count.status > 0)
      .map((item) => item.status),
  );

  const categories = await prisma.ticketCategory.findMany({
    where: {
      concertId,
      name: { in: ['General Admission', 'VIP'] },
    },
    select: {
      id: true,
      name: true,
      price: true,
      quantity: true,
    },
  });
  const generalAdmission = categories.find(
    (category) => category.name === 'General Admission',
  );
  const vip = categories.find((category) => category.name === 'VIP');

  if (!generalAdmission || !vip) {
    throw new Error('Demo ticket categories are required for booking seed');
  }

  await prisma.$transaction(async (tx) => {
    if (!hasStatus.has('PENDING')) {
      await createSeedBooking(tx, {
        userId: customer.id,
        concertId,
        ticketCategoryId: generalAdmission.id,
        status: 'PENDING',
        quantity: 1,
        unitPrice: generalAdmission.price,
        categoryQuantity: generalAdmission.quantity,
        reserveTickets: true,
      });
    }

    if (!hasStatus.has('PAID')) {
      await createSeedBooking(tx, {
        userId: customer.id,
        concertId,
        ticketCategoryId: generalAdmission.id,
        status: 'PAID',
        quantity: 2,
        unitPrice: generalAdmission.price,
        categoryQuantity: generalAdmission.quantity,
        reserveTickets: true,
      });
    }

    if (!hasStatus.has('CANCELLED')) {
      await createSeedBooking(tx, {
        userId: customer.id,
        concertId,
        ticketCategoryId: vip.id,
        status: 'CANCELLED',
        quantity: 1,
        unitPrice: vip.price,
        categoryQuantity: vip.quantity,
        reserveTickets: false,
      });
    }
  });
}

async function upsertDemoCustomer(
  prisma: PrismaClient,
): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: demoCustomerEmail },
    select: { id: true, role: true },
  });

  if (existing) {
    if (existing.role !== Role.CUSTOMER) {
      throw new Error(
        `Demo customer email ${demoCustomerEmail} belongs to a non-customer user`,
      );
    }

    await prisma.user.update({
      where: { email: demoCustomerEmail },
      data: { fullName: demoCustomerFullName },
    });

    return { id: existing.id };
  }

  return prisma.user.create({
    data: {
      email: demoCustomerEmail,
      passwordHash: await bcrypt.hash(demoCustomerPassword, 12),
      fullName: demoCustomerFullName,
      role: Role.CUSTOMER,
    },
    select: { id: true },
  });
}

async function createSeedBooking(
  prisma: Prisma.TransactionClient,
  data: {
    userId: string;
    concertId: string;
    ticketCategoryId: string;
    status: 'PENDING' | 'PAID' | 'CANCELLED';
    quantity: number;
    unitPrice: Prisma.Decimal;
    categoryQuantity: number;
    reserveTickets: boolean;
  },
): Promise<void> {
  if (data.reserveTickets) {
    const maxSoldBeforeReservation = data.categoryQuantity - data.quantity;

    if (maxSoldBeforeReservation < 0) {
      throw new Error('Demo booking ticket quantity is invalid');
    }

    const ticketUpdate = await prisma.ticketCategory.updateMany({
      where: {
        id: data.ticketCategoryId,
        sold: {
          lte: maxSoldBeforeReservation,
        },
      },
      data: {
        sold: {
          increment: data.quantity,
        },
      },
    });

    if (ticketUpdate.count !== 1) {
      throw new Error('Demo booking ticket reservation failed');
    }
  }

  const lineTotal = data.unitPrice.mul(data.quantity);

  await prisma.booking.create({
    data: {
      userId: data.userId,
      concertId: data.concertId,
      status: data.status,
      subtotal: lineTotal.toString(),
      discountAmount: '0',
      totalAmount: lineTotal.toString(),
      items: {
        create: [
          {
            ticketCategoryId: data.ticketCategoryId,
            quantity: data.quantity,
            unitPrice: data.unitPrice.toString(),
            lineTotal: lineTotal.toString(),
          },
        ],
      },
    },
  });
}

async function upsertVoucherByCode(
  prisma: PrismaClient,
  data: {
    code: string;
    description: string;
    discountType: VoucherDiscountType;
    discountValue: string;
    maximumDiscountAmount: string | null;
    minimumOrderAmount: string | null;
    startsAt: Date;
    expiresAt: Date;
    isActive: boolean;
    usageLimit: number | null;
    perUserUsageLimit: number | null;
  },
): Promise<void> {
  const code = normalizeVoucherCode(data.code);
  const existing = await prisma.voucher.findUnique({
    where: { code },
    select: { id: true, usedCount: true, usageLimit: true },
  });

  if (!existing) {
    await prisma.voucher.create({
      data: {
        ...data,
        code,
      },
    });

    return;
  }

  const safeUsageLimit =
    data.usageLimit === null || data.usageLimit >= existing.usedCount
      ? data.usageLimit
      : existing.usageLimit;

  await prisma.voucher.update({
    where: { id: existing.id },
    data: {
      description: data.description,
      discountType: data.discountType,
      discountValue: data.discountValue,
      maximumDiscountAmount: data.maximumDiscountAmount,
      minimumOrderAmount: data.minimumOrderAmount,
      startsAt: data.startsAt,
      expiresAt: data.expiresAt,
      isActive: data.isActive,
      usageLimit: safeUsageLimit,
      perUserUsageLimit: data.perUserUsageLimit,
    },
  });
}

function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase();
}

void main();
