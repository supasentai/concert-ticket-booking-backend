import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConcertStatus,
  VoucherDiscountType,
} from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { VoucherQueryDto } from './dto/voucher-query.dto';
import {
  PaginatedVoucherResponseDto,
  VoucherResponseDto,
} from './dto/voucher-response.dto';
import { VoucherValidationResponseDto } from './dto/voucher-validation-response.dto';

type VoucherEntity = Prisma.VoucherGetPayload<Record<string, never>>;

type VoucherConfig = {
  discountType: VoucherDiscountType;
  discountValue: Prisma.Decimal;
  maximumDiscountAmount: Prisma.Decimal | null;
  minimumOrderAmount: Prisma.Decimal | null;
  startsAt: Date;
  expiresAt: Date;
  usageLimit: number | null;
  usedCount: number;
  perUserUsageLimit: number | null;
  isActive: boolean;
};

type DiscountCalculation = {
  discountAmount: Prisma.Decimal;
  finalAmount: Prisma.Decimal;
};

const MONEY_ZERO = new Prisma.Decimal(0);
const MONEY_100 = new Prisma.Decimal(100);
const MONEY_DECIMAL_PLACES = 2;

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVoucherDto): Promise<VoucherResponseDto> {
    const code = this.normalizeCode(dto.code);
    const config = this.buildCreateConfig(dto);
    this.validateVoucherConfiguration(config);

    try {
      const voucher = await this.prisma.voucher.create({
        data: {
          code,
          description: dto.description ?? null,
          discountType: config.discountType,
          discountValue: config.discountValue,
          maximumDiscountAmount: config.maximumDiscountAmount,
          minimumOrderAmount: config.minimumOrderAmount,
          startsAt: config.startsAt,
          expiresAt: config.expiresAt,
          isActive: dto.isActive ?? true,
          usageLimit: config.usageLimit,
          perUserUsageLimit: config.perUserUsageLimit,
        },
      });

      return this.toVoucherResponse(voucher);
    } catch (error) {
      this.mapPrismaError(error);
      throw error;
    }
  }

  async findAll(query: VoucherQueryDto): Promise<PaginatedVoucherResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [vouchers, total] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return {
      data: vouchers.map((voucher) => this.toVoucherResponse(voucher)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<VoucherResponseDto> {
    const voucher = await this.findVoucherOrThrow(id);

    return this.toVoucherResponse(voucher);
  }

  async update(id: string, dto: UpdateVoucherDto): Promise<VoucherResponseDto> {
    const existing = await this.findVoucherOrThrow(id);
    const finalConfig = this.buildMergedConfig(existing, dto);

    this.validateVoucherConfiguration(finalConfig);

    if (
      finalConfig.usageLimit !== null &&
      finalConfig.usageLimit < existing.usedCount
    ) {
      throw new ConflictException('usageLimit cannot be lower than usedCount');
    }

    if (
      dto.code !== undefined &&
      this.normalizeCode(dto.code) !== existing.code
    ) {
      await this.assertCodeAvailable(this.normalizeCode(dto.code), existing.id);
    }

    try {
      const voucher = await this.prisma.voucher.update({
        where: { id },
        data: this.buildUpdateData(dto, finalConfig),
      });

      return this.toVoucherResponse(voucher);
    } catch (error) {
      this.mapPrismaError(error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findVoucherOrThrow(id);

    const [usageCount, bookingCount] = await this.prisma.$transaction([
      this.prisma.voucherUsage.count({ where: { voucherId: id } }),
      this.prisma.booking.count({ where: { voucherId: id } }),
    ]);

    if (usageCount > 0 || bookingCount > 0) {
      throw new ConflictException(
        'Voucher with usage history cannot be deleted',
      );
    }

    try {
      await this.prisma.voucher.delete({ where: { id } });
    } catch (error) {
      this.mapPrismaError(error);
      throw error;
    }
  }

  async validate(
    user: AuthenticatedUser,
    dto: ValidateVoucherDto,
    now = new Date(),
  ): Promise<VoucherValidationResponseDto> {
    const code = this.normalizeCode(dto.code);
    this.assertUniqueItems(dto.items.map((item) => item.ticketCategoryId));

    const voucher = await this.prisma.voucher.findUnique({
      where: { code },
    });

    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    const subtotal = await this.calculatePreviewSubtotal(dto, now);
    const currentUserUsedCount = await this.findCurrentUserUsedCount(
      voucher.id,
      user.id,
    );

    this.validateVoucherAvailability(
      voucher,
      subtotal,
      currentUserUsedCount,
      now,
    );

    const { discountAmount, finalAmount } = this.calculateVoucherDiscount(
      voucher,
      subtotal,
    );

    return {
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue.toString(),
      maximumDiscountAmount: voucher.maximumDiscountAmount?.toString() ?? null,
      minimumOrderAmount: voucher.minimumOrderAmount?.toString() ?? null,
      subtotal: subtotal.toString(),
      discountAmount: discountAmount.toString(),
      finalAmount: finalAmount.toString(),
      remainingQuantity: this.calculateRemainingQuantity(voucher),
      remainingUserUsage: this.calculateRemainingUserUsage(
        voucher,
        currentUserUsedCount,
      ),
      expiresAt: voucher.expiresAt,
    };
  }

  normalizeCode(code: string): string {
    const normalized = code.trim().toUpperCase();

    if (!normalized) {
      throw new BadRequestException('Voucher code is required');
    }

    return normalized;
  }

  calculateRemainingQuantity(
    voucher: Pick<VoucherEntity, 'usageLimit' | 'usedCount'>,
  ): number | null {
    if (voucher.usageLimit === null) {
      return null;
    }

    return Math.max(voucher.usageLimit - voucher.usedCount, 0);
  }

  calculateVoucherDiscount(
    voucher: Pick<
      VoucherEntity,
      'discountType' | 'discountValue' | 'maximumDiscountAmount'
    >,
    subtotal: Prisma.Decimal,
  ): DiscountCalculation {
    let discountAmount: Prisma.Decimal;

    if (voucher.discountType === VoucherDiscountType.PERCENTAGE) {
      const rawDiscount = subtotal.mul(voucher.discountValue).div(MONEY_100);
      discountAmount = voucher.maximumDiscountAmount
        ? Prisma.Decimal.min(rawDiscount, voucher.maximumDiscountAmount)
        : rawDiscount;
    } else {
      discountAmount = Prisma.Decimal.min(voucher.discountValue, subtotal);
    }

    discountAmount = Prisma.Decimal.min(discountAmount, subtotal);
    discountAmount = discountAmount.toDecimalPlaces(
      MONEY_DECIMAL_PLACES,
      Prisma.Decimal.ROUND_HALF_UP,
    );

    const finalAmount = Prisma.Decimal.max(
      subtotal.minus(discountAmount),
      MONEY_ZERO,
    ).toDecimalPlaces(MONEY_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);

    return { discountAmount, finalAmount };
  }

  validateVoucherConfiguration(config: VoucherConfig): void {
    if (!config.discountValue.gt(MONEY_ZERO)) {
      throw new BadRequestException('discountValue must be greater than 0');
    }

    if (
      config.discountType === VoucherDiscountType.PERCENTAGE &&
      config.discountValue.gt(MONEY_100)
    ) {
      throw new BadRequestException(
        'Percentage discountValue must not exceed 100',
      );
    }

    if (
      config.discountType === VoucherDiscountType.FIXED_AMOUNT &&
      config.maximumDiscountAmount !== null
    ) {
      throw new BadRequestException(
        'maximumDiscountAmount is only allowed for percentage vouchers',
      );
    }

    if (
      config.maximumDiscountAmount !== null &&
      !config.maximumDiscountAmount.gt(MONEY_ZERO)
    ) {
      throw new BadRequestException(
        'maximumDiscountAmount must be greater than 0',
      );
    }

    if (
      config.minimumOrderAmount !== null &&
      config.minimumOrderAmount.lt(MONEY_ZERO)
    ) {
      throw new BadRequestException(
        'minimumOrderAmount must be greater than or equal to 0',
      );
    }

    if (config.startsAt >= config.expiresAt) {
      throw new BadRequestException('startsAt must be earlier than expiresAt');
    }

    if (
      config.usageLimit !== null &&
      config.perUserUsageLimit !== null &&
      config.perUserUsageLimit > config.usageLimit
    ) {
      throw new BadRequestException(
        'perUserUsageLimit must not exceed usageLimit',
      );
    }
  }

  validateVoucherAvailability(
    voucher: VoucherEntity,
    subtotal: Prisma.Decimal,
    currentUserUsedCount: number,
    now: Date,
  ): void {
    this.validateVoucherConfiguration(this.toConfig(voucher));

    if (!voucher.isActive) {
      throw new ConflictException('Voucher is inactive');
    }

    if (now < voucher.startsAt) {
      throw new ConflictException('Voucher has not started');
    }

    if (now >= voucher.expiresAt) {
      throw new ConflictException('Voucher has expired');
    }

    if (
      voucher.usageLimit !== null &&
      voucher.usedCount >= voucher.usageLimit
    ) {
      throw new ConflictException('Voucher usage limit exhausted');
    }

    if (
      voucher.perUserUsageLimit !== null &&
      currentUserUsedCount >= voucher.perUserUsageLimit
    ) {
      throw new ConflictException('User voucher usage limit exhausted');
    }

    if (
      voucher.minimumOrderAmount !== null &&
      subtotal.lt(voucher.minimumOrderAmount)
    ) {
      throw new BadRequestException('Minimum order amount is not met');
    }
  }

  private buildWhere(query: VoucherQueryDto): Prisma.VoucherWhereInput {
    const where: Prisma.VoucherWhereInput = {};

    if (query.search) {
      const normalizedSearch = query.search.trim().toUpperCase();
      where.code = { contains: normalizedSearch, mode: 'insensitive' };
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.discountType) {
      where.discountType = query.discountType;
    }

    return where;
  }

  private async calculatePreviewSubtotal(
    dto: ValidateVoucherDto,
    now: Date,
  ): Promise<Prisma.Decimal> {
    const concert = await this.prisma.concert.findFirst({
      where: {
        id: dto.concertId,
        status: ConcertStatus.PUBLISHED,
        endTime: {
          gt: now,
        },
      },
      select: { id: true },
    });

    if (!concert) {
      throw new NotFoundException('Concert not found');
    }

    const categoryIds = dto.items.map((item) => item.ticketCategoryId);
    const categories = await this.prisma.ticketCategory.findMany({
      where: {
        id: { in: categoryIds },
        concertId: dto.concertId,
      },
      select: {
        id: true,
        price: true,
        quantity: true,
        sold: true,
        isActive: true,
      },
    });

    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    );
    let subtotal = new Prisma.Decimal(0);

    for (const item of dto.items) {
      const category = categoriesById.get(item.ticketCategoryId);

      if (!category) {
        throw new NotFoundException('Ticket category not found');
      }

      if (!category.isActive) {
        throw new ConflictException('Ticket category is not active');
      }

      if (category.sold + item.quantity > category.quantity) {
        throw new ConflictException('Not enough tickets remaining');
      }

      subtotal = subtotal.add(category.price.mul(item.quantity));
    }

    return subtotal;
  }

  private async findCurrentUserUsedCount(
    voucherId: string,
    userId: string,
  ): Promise<number> {
    const counter = await this.prisma.voucherUserUsage.findUnique({
      where: {
        voucherId_userId: {
          voucherId,
          userId,
        },
      },
      select: { usedCount: true },
    });

    return counter?.usedCount ?? 0;
  }

  private calculateRemainingUserUsage(
    voucher: Pick<VoucherEntity, 'perUserUsageLimit'>,
    currentUserUsedCount: number,
  ): number | null {
    if (voucher.perUserUsageLimit === null) {
      return null;
    }

    return Math.max(voucher.perUserUsageLimit - currentUserUsedCount, 0);
  }

  private buildCreateConfig(dto: CreateVoucherDto): VoucherConfig {
    return {
      discountType: dto.discountType,
      discountValue: this.toDecimal(dto.discountValue),
      maximumDiscountAmount: this.toNullableDecimal(dto.maximumDiscountAmount),
      minimumOrderAmount: this.toNullableDecimal(dto.minimumOrderAmount),
      startsAt: this.parseDate(dto.startsAt, 'startsAt'),
      expiresAt: this.parseDate(dto.expiresAt, 'expiresAt'),
      usageLimit: dto.usageLimit ?? null,
      usedCount: 0,
      perUserUsageLimit: dto.perUserUsageLimit ?? null,
      isActive: dto.isActive ?? true,
    };
  }

  private buildMergedConfig(
    existing: VoucherEntity,
    dto: UpdateVoucherDto,
  ): VoucherConfig {
    return {
      discountType: dto.discountType ?? existing.discountType,
      discountValue:
        dto.discountValue !== undefined
          ? this.toDecimal(dto.discountValue)
          : existing.discountValue,
      maximumDiscountAmount:
        dto.maximumDiscountAmount !== undefined
          ? this.toNullableDecimal(dto.maximumDiscountAmount)
          : existing.maximumDiscountAmount,
      minimumOrderAmount:
        dto.minimumOrderAmount !== undefined
          ? this.toNullableDecimal(dto.minimumOrderAmount)
          : existing.minimumOrderAmount,
      startsAt: dto.startsAt
        ? this.parseDate(dto.startsAt, 'startsAt')
        : existing.startsAt,
      expiresAt: dto.expiresAt
        ? this.parseDate(dto.expiresAt, 'expiresAt')
        : existing.expiresAt,
      usageLimit:
        dto.usageLimit !== undefined ? dto.usageLimit : existing.usageLimit,
      usedCount: existing.usedCount,
      perUserUsageLimit:
        dto.perUserUsageLimit !== undefined
          ? dto.perUserUsageLimit
          : existing.perUserUsageLimit,
      isActive: dto.isActive ?? existing.isActive,
    };
  }

  private buildUpdateData(
    dto: UpdateVoucherDto,
    config: VoucherConfig,
  ): Prisma.VoucherUpdateInput {
    const data: Prisma.VoucherUpdateInput = {};

    if (dto.code !== undefined) data.code = this.normalizeCode(dto.code);
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.discountType !== undefined) data.discountType = config.discountType;
    if (dto.discountValue !== undefined)
      data.discountValue = config.discountValue;
    if (dto.maximumDiscountAmount !== undefined) {
      data.maximumDiscountAmount = config.maximumDiscountAmount;
    }
    if (dto.minimumOrderAmount !== undefined) {
      data.minimumOrderAmount = config.minimumOrderAmount;
    }
    if (dto.startsAt !== undefined) data.startsAt = config.startsAt;
    if (dto.expiresAt !== undefined) data.expiresAt = config.expiresAt;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.usageLimit !== undefined) data.usageLimit = config.usageLimit;
    if (dto.perUserUsageLimit !== undefined) {
      data.perUserUsageLimit = config.perUserUsageLimit;
    }

    return data;
  }

  private toConfig(voucher: VoucherEntity): VoucherConfig {
    return {
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      maximumDiscountAmount: voucher.maximumDiscountAmount,
      minimumOrderAmount: voucher.minimumOrderAmount,
      startsAt: voucher.startsAt,
      expiresAt: voucher.expiresAt,
      usageLimit: voucher.usageLimit,
      usedCount: voucher.usedCount,
      perUserUsageLimit: voucher.perUserUsageLimit,
      isActive: voucher.isActive,
    };
  }

  private async findVoucherOrThrow(id: string): Promise<VoucherEntity> {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
    });

    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    return voucher;
  }

  private async assertCodeAvailable(
    code: string,
    currentVoucherId: string,
  ): Promise<void> {
    const existing = await this.prisma.voucher.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing && existing.id !== currentVoucherId) {
      throw new ConflictException('Voucher code already exists');
    }
  }

  private assertUniqueItems(ticketCategoryIds: string[]): void {
    const uniqueIds = new Set(ticketCategoryIds);

    if (uniqueIds.size !== ticketCategoryIds.length) {
      throw new BadRequestException(
        'Duplicate ticket categories are not allowed',
      );
    }
  }

  private toNullableDecimal(
    value: string | null | undefined,
  ): Prisma.Decimal | null {
    return value === undefined || value === null ? null : this.toDecimal(value);
  }

  private toDecimal(value: string): Prisma.Decimal {
    try {
      return new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException('Decimal value is invalid');
    }
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO datetime`);
    }

    return date;
  }

  private mapPrismaError(error: unknown): void {
    if (this.isPrismaKnownError(error, 'P2002')) {
      throw new ConflictException('Voucher code already exists');
    }

    if (this.isPrismaKnownError(error, 'P2025')) {
      throw new NotFoundException('Voucher not found');
    }
  }

  private isPrismaKnownError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }

  private toVoucherResponse(voucher: VoucherEntity): VoucherResponseDto {
    return {
      id: voucher.id,
      code: voucher.code,
      description: voucher.description,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue.toString(),
      maximumDiscountAmount: voucher.maximumDiscountAmount?.toString() ?? null,
      minimumOrderAmount: voucher.minimumOrderAmount?.toString() ?? null,
      startsAt: voucher.startsAt,
      expiresAt: voucher.expiresAt,
      isActive: voucher.isActive,
      usageLimit: voucher.usageLimit,
      usedCount: voucher.usedCount,
      remainingQuantity: this.calculateRemainingQuantity(voucher),
      perUserUsageLimit: voucher.perUserUsageLimit,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
    };
  }
}
