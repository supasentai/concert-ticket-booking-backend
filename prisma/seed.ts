import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '../generated/prisma/client';

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

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const existingOperator = await prisma.user.findUnique({
      where: { email: seedOperatorEmail },
      select: { id: true, role: true },
    });

    if (existingOperator) {
      if (existingOperator.role !== Role.OPERATOR) {
        throw new Error(
          `Seed email ${seedOperatorEmail} already belongs to a non-operator user`,
        );
      }

      await prisma.user.update({
        where: { email: seedOperatorEmail },
        data: {
          fullName: seedOperatorFullName,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          email: seedOperatorEmail,
          passwordHash: await bcrypt.hash(seedOperatorPassword, 12),
          fullName: seedOperatorFullName,
          role: Role.OPERATOR,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
