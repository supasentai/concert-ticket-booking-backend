import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  ConcertStatus,
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

    await seedDemoConcerts(prisma, operator.id);
    await seedDemoVouchers(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDemoConcerts(
  prisma: PrismaClient,
  operatorId: string,
): Promise<void> {
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
