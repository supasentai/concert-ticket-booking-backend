import { Injectable } from '@nestjs/common';
import { BookingStatus, ConcertStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DashboardSummaryResponseDto } from './dto/dashboard-summary-response.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummaryResponseDto> {
    const now = new Date();
    const [
      totalConcerts,
      publishedConcerts,
      draftConcerts,
      totalBookings,
      pendingBookings,
      paidBookings,
      cancelledBookings,
      paidRevenue,
      paidBookingItems,
      activeVouchers,
    ] = await this.prisma.$transaction([
      this.prisma.concert.count(),
      this.prisma.concert.count({
        where: { status: ConcertStatus.PUBLISHED },
      }),
      this.prisma.concert.count({
        where: { status: ConcertStatus.DRAFT },
      }),
      this.prisma.booking.count(),
      this.prisma.booking.count({
        where: { status: BookingStatus.PENDING },
      }),
      this.prisma.booking.count({
        where: { status: BookingStatus.PAID },
      }),
      this.prisma.booking.count({
        where: { status: BookingStatus.CANCELLED },
      }),
      this.prisma.booking.aggregate({
        where: { status: BookingStatus.PAID },
        _sum: { totalAmount: true },
      }),
      this.prisma.bookingItem.aggregate({
        where: {
          booking: {
            status: BookingStatus.PAID,
          },
        },
        _sum: { quantity: true },
      }),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Voucher"
        WHERE "isActive" = true
          AND "startsAt" <= ${now}
          AND "expiresAt" > ${now}
          AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
      `),
    ]);

    return {
      totalConcerts,
      publishedConcerts,
      draftConcerts,
      totalBookings,
      pendingBookings,
      paidBookings,
      cancelledBookings,
      grossRevenue: paidRevenue._sum.totalAmount?.toString() ?? '0',
      ticketsSold: paidBookingItems._sum.quantity ?? 0,
      activeVouchers: Number(activeVouchers[0]?.count ?? 0),
    };
  }
}
