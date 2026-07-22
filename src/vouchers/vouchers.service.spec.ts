import { BadRequestException, ConflictException } from '@nestjs/common';
import { VoucherDiscountType } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { VouchersService } from './vouchers.service';

jest.mock('../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const startsAt = new Date('2026-07-23T00:00:00.000Z');
const expiresAt = new Date('2026-07-24T00:00:00.000Z');
const exactStart = new Date('2026-07-23T00:00:00.000Z');
const beforeExpiration = new Date('2026-07-23T23:59:59.999Z');
const exactExpiration = new Date('2026-07-24T00:00:00.000Z');

const baseVoucher = {
  id: 'voucher-id',
  code: 'SUMMER20',
  description: 'Summer discount',
  discountType: VoucherDiscountType.PERCENTAGE,
  discountValue: new Prisma.Decimal('20.00'),
  maximumDiscountAmount: null,
  minimumOrderAmount: null,
  startsAt,
  expiresAt,
  isActive: true,
  usageLimit: 10,
  usedCount: 0,
  perUserUsageLimit: 2,
  createdAt: startsAt,
  updatedAt: startsAt,
};

describe('VouchersService', () => {
  const prisma = {
    voucher: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    concert: {
      findFirst: jest.fn(),
    },
    ticketCategory: {
      findMany: jest.fn(),
    },
    voucherUserUsage: {
      findUnique: jest.fn(),
    },
  };

  let service: VouchersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VouchersService(prisma as never);
  });

  it('normalizes voucher codes', () => {
    expect(service.normalizeCode(' summer20 ')).toBe('SUMMER20');
  });

  it('rejects empty normalized voucher codes', () => {
    expect(() => service.normalizeCode('   ')).toThrow(BadRequestException);
  });

  it('rejects percentage discounts above 100', () => {
    expect(() =>
      service.validateVoucherConfiguration({
        ...baseVoucher,
        discountValue: new Prisma.Decimal('100.01'),
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects fixed vouchers with a maximum discount amount', () => {
    expect(() =>
      service.validateVoucherConfiguration({
        ...baseVoucher,
        discountType: VoucherDiscountType.FIXED_AMOUNT,
        maximumDiscountAmount: new Prisma.Decimal('10.00'),
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid date ranges', () => {
    expect(() =>
      service.validateVoucherConfiguration({
        ...baseVoucher,
        startsAt: expiresAt,
        expiresAt: startsAt,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects per-user limits greater than total usage limits', () => {
    expect(() =>
      service.validateVoucherConfiguration({
        ...baseVoucher,
        usageLimit: 1,
        perUserUsageLimit: 2,
      }),
    ).toThrow(BadRequestException);
  });

  it('calculates remaining quantity safely', () => {
    expect(
      service.calculateRemainingQuantity({
        usageLimit: 10,
        usedCount: 3,
      }),
    ).toBe(7);
    expect(
      service.calculateRemainingQuantity({
        usageLimit: 10,
        usedCount: 12,
      }),
    ).toBe(0);
    expect(
      service.calculateRemainingQuantity({
        usageLimit: null,
        usedCount: 12,
      }),
    ).toBeNull();
  });

  it('calculates percentage discounts', () => {
    const result = service.calculateVoucherDiscount(
      baseVoucher,
      new Prisma.Decimal('500.00'),
    );

    expect(result.discountAmount.toString()).toBe('100');
    expect(result.finalAmount.toString()).toBe('400');
  });

  it('applies percentage maximum caps', () => {
    const result = service.calculateVoucherDiscount(
      {
        ...baseVoucher,
        maximumDiscountAmount: new Prisma.Decimal('50.00'),
      },
      new Prisma.Decimal('500.00'),
    );

    expect(result.discountAmount.toString()).toBe('50');
    expect(result.finalAmount.toString()).toBe('450');
  });

  it('caps fixed discounts at subtotal', () => {
    const result = service.calculateVoucherDiscount(
      {
        ...baseVoucher,
        discountType: VoucherDiscountType.FIXED_AMOUNT,
        discountValue: new Prisma.Decimal('500.00'),
      },
      new Prisma.Decimal('120.00'),
    );

    expect(result.discountAmount.toString()).toBe('120');
    expect(result.finalAmount.toString()).toBe('0');
  });

  it('handles decimal precision without number arithmetic', () => {
    const result = service.calculateVoucherDiscount(
      {
        ...baseVoucher,
        discountValue: new Prisma.Decimal('12.50'),
      },
      new Prisma.Decimal('99.99'),
    );

    expect(result.discountAmount.toString()).toBe('12.5');
    expect(result.finalAmount.toString()).toBe('87.49');
  });

  it('accepts exact start and just before expiration boundaries', () => {
    expect(() =>
      service.validateVoucherAvailability(
        baseVoucher,
        new Prisma.Decimal('100.00'),
        0,
        exactStart,
      ),
    ).not.toThrow();
    expect(() =>
      service.validateVoucherAvailability(
        baseVoucher,
        new Prisma.Decimal('100.00'),
        0,
        beforeExpiration,
      ),
    ).not.toThrow();
  });

  it('rejects inactive, not-started, expired, exhausted, and minimum-order cases', () => {
    expect(() =>
      service.validateVoucherAvailability(
        { ...baseVoucher, isActive: false },
        new Prisma.Decimal('100.00'),
        0,
        exactStart,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateVoucherAvailability(
        baseVoucher,
        new Prisma.Decimal('100.00'),
        0,
        new Date('2026-07-22T23:59:59.999Z'),
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateVoucherAvailability(
        baseVoucher,
        new Prisma.Decimal('100.00'),
        0,
        exactExpiration,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateVoucherAvailability(
        { ...baseVoucher, usedCount: 10 },
        new Prisma.Decimal('100.00'),
        0,
        exactStart,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateVoucherAvailability(
        baseVoucher,
        new Prisma.Decimal('100.00'),
        2,
        exactStart,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateVoucherAvailability(
        {
          ...baseVoucher,
          minimumOrderAmount: new Prisma.Decimal('200.00'),
        },
        new Prisma.Decimal('100.00'),
        0,
        exactStart,
      ),
    ).toThrow(BadRequestException);
  });

  it('update validates merged current and incoming state', async () => {
    prisma.voucher.findUnique.mockResolvedValue(baseVoucher);

    await expect(
      service.update(baseVoucher.id, { discountValue: '150.00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update rejects usage limits below used count', async () => {
    prisma.voucher.findUnique.mockResolvedValue({
      ...baseVoucher,
      usedCount: 3,
    });

    await expect(
      service.update(baseVoucher.id, { usageLimit: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
