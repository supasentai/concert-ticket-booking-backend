import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, ConcertStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../common/prisma/prisma.service';
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

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

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

      return tx.booking.create({
        data: {
          userId: user.id,
          concertId: dto.concertId,
          status: BookingStatus.PENDING,
          totalAmount: lineTotal,
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

  private toResponse(booking: BookingWithDetails): BookingResponseDto {
    return {
      id: booking.id,
      userId: booking.userId,
      concertId: booking.concertId,
      concertTitle: booking.concert.title,
      status: booking.status,
      totalAmount: booking.totalAmount.toString(),
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
