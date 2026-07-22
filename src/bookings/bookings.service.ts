import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BookingStatus,
  ConcertStatus,
  VoucherUsageStatus,
} from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

const BOOKING_INCLUDE = {
  concert: {
    select: {
      id: true,
      title: true,
    },
  },
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      ticketCategory: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.BookingInclude;

type BookingWithDetails = Prisma.BookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

type BookingTransaction = PrismaService | Prisma.TransactionClient;

type VoucherSnapshot = {
  voucherId: string;
  voucherCodeSnapshot: string;
  voucherDiscountTypeSnapshot: Prisma.VoucherGetPayload<
    Record<string, never>
  >['discountType'];
  voucherDiscountValueSnapshot: Prisma.Decimal;
  voucherMaximumDiscountAmountSnapshot: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchersService: VouchersService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    const booking = await this.prisma.$transaction(async (tx) => {
      const category = await tx.ticketCategory.findFirst({
        where: {
          id: dto.ticketCategoryId,
          concertId: dto.concertId,
        },
        include: {
          concert: {
            select: {
              id: true,
              status: true,
              endTime: true,
            },
          },
        },
      });

      if (!category) {
        await this.assertConcertExists(dto.concertId, tx);
        throw new NotFoundException('Ticket category not found');
      }

      if (category.concert.status !== ConcertStatus.PUBLISHED) {
        throw new ConflictException('Concert is not published');
      }

      if (category.concert.endTime <= new Date()) {
        throw new ConflictException('Concert has already ended');
      }

      if (!category.isActive) {
        throw new ConflictException('Ticket category is not active');
      }

      const maxSoldBeforeReservation = category.quantity - dto.quantity;

      if (maxSoldBeforeReservation < 0) {
        throw new ConflictException('Not enough tickets remaining');
      }

      const updateResult = await tx.ticketCategory.updateMany({
        where: {
          id: category.id,
          concertId: dto.concertId,
          isActive: true,
          sold: {
            lte: maxSoldBeforeReservation,
          },
        },
        data: {
          sold: {
            increment: dto.quantity,
          },
        },
      });

      if (updateResult.count !== 1) {
        throw new ConflictException('Not enough tickets remaining');
      }

      const unitPrice = new Prisma.Decimal(category.price.toString());
      const lineTotal = unitPrice.mul(dto.quantity);
      const subtotal = lineTotal;
      const voucherSnapshot = dto.voucherCode
        ? await this.consumeVoucherForBooking(
            tx,
            user,
            dto.voucherCode,
            subtotal,
          )
        : null;
      const discountAmount =
        voucherSnapshot?.discountAmount ?? new Prisma.Decimal(0);
      const totalAmount = voucherSnapshot?.totalAmount ?? subtotal;

      const booking = await tx.booking.create({
        data: {
          userId: user.id,
          concertId: dto.concertId,
          status: BookingStatus.PENDING,
          subtotal,
          discountAmount,
          totalAmount,
          voucherId: voucherSnapshot?.voucherId ?? null,
          voucherCodeSnapshot: voucherSnapshot?.voucherCodeSnapshot ?? null,
          voucherDiscountTypeSnapshot:
            voucherSnapshot?.voucherDiscountTypeSnapshot ?? null,
          voucherDiscountValueSnapshot:
            voucherSnapshot?.voucherDiscountValueSnapshot ?? null,
          voucherMaximumDiscountAmountSnapshot:
            voucherSnapshot?.voucherMaximumDiscountAmountSnapshot ?? null,
          items: {
            create: [
              {
                ticketCategoryId: category.id,
                quantity: dto.quantity,
                unitPrice,
                lineTotal,
              },
            ],
          },
        },
        include: BOOKING_INCLUDE,
      });

      if (voucherSnapshot) {
        await tx.voucherUsage.create({
          data: {
            voucherId: voucherSnapshot.voucherId,
            userId: user.id,
            bookingId: booking.id,
            status: VoucherUsageStatus.APPLIED,
          },
        });
      }

      return booking;
    });

    return this.toResponse(booking);
  }

  async findMine(user: AuthenticatedUser): Promise<BookingResponseDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: BOOKING_INCLUDE,
    });

    return bookings.map((booking) => this.toResponse(booking));
  }

  async findOne(
    user: AuthenticatedUser,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.findOwnedBookingOrThrow(user, bookingId);

    return this.toResponse(booking);
  }

  async pay(
    user: AuthenticatedUser,
    bookingId: string,
    success: boolean,
  ): Promise<BookingResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      if (success) {
        const paid = await this.transitionPendingBookingOrThrow(
          tx,
          user,
          bookingId,
          BookingStatus.PAID,
          'Only pending bookings may be paid',
        );

        return this.toResponse(paid);
      }

      const booking = await this.transitionPendingBookingOrThrow(
        tx,
        user,
        bookingId,
        BookingStatus.CANCELLED,
        'Only pending bookings may be paid',
      );

      await this.restoreReservedTickets(tx, booking);
      await this.releaseVoucherUsage(tx, booking.id);

      const cancelled = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: BOOKING_INCLUDE,
      });

      return this.toResponse(cancelled);
    });
  }

  async cancel(
    user: AuthenticatedUser,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.transitionPendingBookingOrThrow(
        tx,
        user,
        bookingId,
        BookingStatus.CANCELLED,
        'Only pending bookings may be cancelled',
      );

      await this.restoreReservedTickets(tx, booking);
      await this.releaseVoucherUsage(tx, booking.id);

      const cancelled = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: BOOKING_INCLUDE,
      });

      return this.toResponse(cancelled);
    });
  }

  private async assertConcertExists(
    concertId: string,
    prisma: BookingTransaction = this.prisma,
  ): Promise<void> {
    const concert = await prisma.concert.findUnique({
      where: { id: concertId },
      select: { id: true },
    });

    if (!concert) {
      throw new NotFoundException('Concert not found');
    }
  }

  private async findOwnedBookingOrThrow(
    user: AuthenticatedUser,
    bookingId: string,
    prisma: BookingTransaction = this.prisma,
  ): Promise<BookingWithDetails> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: BOOKING_INCLUDE,
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== user.id) {
      throw new ForbiddenException('Cannot access another customer booking');
    }

    return booking;
  }

  private async transitionPendingBookingOrThrow(
    prisma: Prisma.TransactionClient,
    user: AuthenticatedUser,
    bookingId: string,
    status: BookingStatus,
    conflictMessage: string,
  ): Promise<BookingWithDetails> {
    const updateResult = await prisma.booking.updateMany({
      where: {
        id: bookingId,
        userId: user.id,
        status: BookingStatus.PENDING,
      },
      data: { status },
    });

    if (updateResult.count === 1) {
      return prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: BOOKING_INCLUDE,
      });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== user.id) {
      throw new ForbiddenException('Cannot access another customer booking');
    }

    throw new ConflictException(conflictMessage);
  }

  private async restoreReservedTickets(
    prisma: BookingTransaction,
    booking: BookingWithDetails,
  ): Promise<void> {
    for (const item of booking.items) {
      const updateResult = await prisma.ticketCategory.updateMany({
        where: {
          id: item.ticketCategoryId,
          sold: {
            gte: item.quantity,
          },
        },
        data: {
          sold: {
            decrement: item.quantity,
          },
        },
      });

      if (updateResult.count !== 1) {
        throw new ConflictException('Reserved tickets could not be restored');
      }
    }
  }

  private async consumeVoucherForBooking(
    prisma: Prisma.TransactionClient,
    user: AuthenticatedUser,
    rawCode: string,
    subtotal: Prisma.Decimal,
  ): Promise<VoucherSnapshot> {
    const now = new Date();
    const code = this.vouchersService.normalizeCode(rawCode);
    const voucher = await prisma.voucher.findUnique({
      where: { code },
    });

    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    const userCounter = await prisma.voucherUserUsage.findUnique({
      where: {
        voucherId_userId: {
          voucherId: voucher.id,
          userId: user.id,
        },
      },
      select: { usedCount: true },
    });
    const currentUserUsedCount = userCounter?.usedCount ?? 0;

    this.vouchersService.validateVoucherAvailability(
      voucher,
      subtotal,
      currentUserUsedCount,
      now,
    );

    const { discountAmount, finalAmount } =
      this.vouchersService.calculateVoucherDiscount(voucher, subtotal);

    await this.incrementVoucherGlobalUsage(prisma, voucher, now);
    await this.incrementVoucherUserUsage(prisma, voucher, user.id);

    return {
      voucherId: voucher.id,
      voucherCodeSnapshot: voucher.code,
      voucherDiscountTypeSnapshot: voucher.discountType,
      voucherDiscountValueSnapshot: voucher.discountValue,
      voucherMaximumDiscountAmountSnapshot: voucher.maximumDiscountAmount,
      discountAmount,
      totalAmount: finalAmount,
    };
  }

  private async incrementVoucherGlobalUsage(
    prisma: Prisma.TransactionClient,
    voucher: Prisma.VoucherGetPayload<Record<string, never>>,
    now: Date,
  ): Promise<void> {
    const rows =
      voucher.usageLimit === null
        ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            UPDATE "Voucher"
            SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
            WHERE id = ${voucher.id}
              AND "isActive" = true
              AND "startsAt" <= ${now}
              AND "expiresAt" > ${now}
              AND "usageLimit" IS NULL
            RETURNING id
          `)
        : await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            UPDATE "Voucher"
            SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
            WHERE id = ${voucher.id}
              AND "isActive" = true
              AND "startsAt" <= ${now}
              AND "expiresAt" > ${now}
              AND "usageLimit" IS NOT NULL
              AND "usedCount" < "usageLimit"
            RETURNING id
          `);

    if (rows.length !== 1) {
      throw new ConflictException('Voucher usage limit exhausted');
    }
  }

  private async incrementVoucherUserUsage(
    prisma: Prisma.TransactionClient,
    voucher: Prisma.VoucherGetPayload<Record<string, never>>,
    userId: string,
  ): Promise<void> {
    const counterId = randomUUID();
    const rows =
      voucher.perUserUsageLimit === null
        ? await prisma.$queryRaw<{ usedCount: number }[]>(Prisma.sql`
            INSERT INTO "VoucherUserUsage" ("id", "voucherId", "userId", "usedCount", "createdAt", "updatedAt")
            VALUES (${counterId}, ${voucher.id}, ${userId}, 1, now(), now())
            ON CONFLICT ("voucherId", "userId")
            DO UPDATE SET "usedCount" = "VoucherUserUsage"."usedCount" + 1, "updatedAt" = now()
            RETURNING "usedCount"
          `)
        : await prisma.$queryRaw<{ usedCount: number }[]>(Prisma.sql`
            INSERT INTO "VoucherUserUsage" ("id", "voucherId", "userId", "usedCount", "createdAt", "updatedAt")
            VALUES (${counterId}, ${voucher.id}, ${userId}, 1, now(), now())
            ON CONFLICT ("voucherId", "userId")
            DO UPDATE SET "usedCount" = "VoucherUserUsage"."usedCount" + 1, "updatedAt" = now()
            WHERE "VoucherUserUsage"."usedCount" < ${voucher.perUserUsageLimit}
            RETURNING "usedCount"
          `);

    if (rows.length !== 1) {
      throw new ConflictException('User voucher usage limit exhausted');
    }
  }

  private async releaseVoucherUsage(
    prisma: Prisma.TransactionClient,
    bookingId: string,
  ): Promise<void> {
    const usage = await prisma.voucherUsage.findUnique({
      where: { bookingId },
      select: {
        id: true,
        voucherId: true,
        userId: true,
      },
    });

    if (!usage) {
      return;
    }

    const usageUpdate = await prisma.voucherUsage.updateMany({
      where: {
        id: usage.id,
        status: VoucherUsageStatus.APPLIED,
      },
      data: {
        status: VoucherUsageStatus.RELEASED,
        releasedAt: new Date(),
      },
    });

    if (usageUpdate.count !== 1) {
      throw new ConflictException('Voucher usage could not be released');
    }

    const voucherUpdate = await prisma.voucher.updateMany({
      where: {
        id: usage.voucherId,
        usedCount: { gt: 0 },
      },
      data: {
        usedCount: {
          decrement: 1,
        },
      },
    });

    if (voucherUpdate.count !== 1) {
      throw new ConflictException(
        'Voucher usage counter could not be restored',
      );
    }

    const userCounterUpdate = await prisma.voucherUserUsage.updateMany({
      where: {
        voucherId: usage.voucherId,
        userId: usage.userId,
        usedCount: { gt: 0 },
      },
      data: {
        usedCount: {
          decrement: 1,
        },
      },
    });

    if (userCounterUpdate.count !== 1) {
      throw new ConflictException(
        'User voucher usage counter could not be restored',
      );
    }
  }

  private toResponse(booking: BookingWithDetails): BookingResponseDto {
    return {
      id: booking.id,
      userId: booking.userId,
      concertId: booking.concertId,
      concertTitle: booking.concert.title,
      status: booking.status,
      subtotal: booking.subtotal.toString(),
      discountAmount: booking.discountAmount.toString(),
      totalAmount: booking.totalAmount.toString(),
      voucherCode: booking.voucherCodeSnapshot,
      voucherDiscountType: booking.voucherDiscountTypeSnapshot,
      voucherDiscountValue:
        booking.voucherDiscountValueSnapshot?.toString() ?? null,
      voucherMaximumDiscountAmount:
        booking.voucherMaximumDiscountAmountSnapshot?.toString() ?? null,
      items: booking.items.map((item) => ({
        id: item.id,
        ticketCategoryId: item.ticketCategoryId,
        ticketCategoryName: item.ticketCategory.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
      })),
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}
