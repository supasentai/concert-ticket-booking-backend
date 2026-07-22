import { BookingStatus, ConcertStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma = {
    $transaction: jest.fn(),
    concert: {
      count: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    bookingItem: {
      aggregate: jest.fn(),
    },
    voucher: {
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DashboardService(prisma as never);
  });

  it('summarizes operation metrics from aggregate query results', async () => {
    prisma.$transaction.mockResolvedValue([
      5,
      3,
      2,
      10,
      4,
      5,
      1,
      { _sum: { totalAmount: new Prisma.Decimal('123.45') } },
      { _sum: { quantity: 8 } },
      [{ count: 6n }],
    ]);

    await expect(service.getSummary()).resolves.toEqual({
      totalConcerts: 5,
      publishedConcerts: 3,
      draftConcerts: 2,
      totalBookings: 10,
      pendingBookings: 4,
      paidBookings: 5,
      cancelledBookings: 1,
      grossRevenue: '123.45',
      ticketsSold: 8,
      activeVouchers: 6,
    });

    expect(prisma.concert.count).toHaveBeenCalledWith({
      where: { status: ConcertStatus.PUBLISHED },
    });
    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: { status: BookingStatus.PAID },
    });
    expect(prisma.booking.aggregate).toHaveBeenCalledWith({
      where: { status: BookingStatus.PAID },
      _sum: { totalAmount: true },
    });
    expect(prisma.bookingItem.aggregate).toHaveBeenCalledWith({
      where: {
        booking: {
          status: BookingStatus.PAID,
        },
      },
      _sum: { quantity: true },
    });
  });
});
