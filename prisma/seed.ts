import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { ConcertStatus, PrismaClient, Role } from '../generated/prisma/client';

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
    sold: 0,
    isActive: true,
  });
  await upsertTicketCategory(prisma, publishedConcert.id, 'VIP', {
    description: 'Seeded active VIP category.',
    price: 129.99,
    quantity: 100,
    sold: 0,
    isActive: true,
  });
  await upsertTicketCategory(prisma, publishedConcert.id, 'Archived Early Bird', {
    description: 'Seeded inactive category hidden from public details.',
    price: 29.99,
    quantity: 50,
    sold: 0,
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
    sold: 0,
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
    sold: 0,
    isActive: true,
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
    sold: number;
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
      ...data,
    },
    update: data,
  });
}

void main();
