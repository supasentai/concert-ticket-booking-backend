import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConcertStatus, Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConcertsService } from './concerts.service';

jest.mock('../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const now = new Date('2026-07-22T00:00:00.000Z');
const startTime = '2026-08-01T19:00:00.000Z';
const endTime = '2026-08-01T22:00:00.000Z';
const saleStartAt = '2026-07-01T00:00:00.000Z';
const saleEndAt = '2026-08-01T18:00:00.000Z';

const operator: AuthenticatedUser = {
  id: 'operator-id',
  email: 'operator@example.com',
  role: Role.OPERATOR,
};

const decimal = {
  toString: () => '49.99',
};

const negativeDecimal = {
  toString: () => '-1',
};

const baseConcert = {
  id: 'concert-id',
  title: 'Summer Lights Festival',
  description: 'Outdoor show',
  venue: 'City Arena',
  address: '123 Main Street',
  startTime: new Date(startTime),
  endTime: new Date(endTime),
  saleStartAt: new Date(saleStartAt),
  saleEndAt: new Date(saleEndAt),
  posterUrl: 'https://example.com/poster.jpg',
  status: ConcertStatus.DRAFT,
  publishedAt: null,
  createdById: operator.id,
  createdBy: {
    id: operator.id,
    email: operator.email,
    fullName: 'Test Operator',
  },
  createdAt: now,
  updatedAt: now,
};

const baseCategory = {
  id: 'category-id',
  concertId: 'concert-id',
  name: 'General Admission',
  description: null,
  price: decimal,
  quantity: 100,
  sold: 0,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

type PublicFindManyArgs = {
  where: {
    endTime: {
      gt: Date;
    };
  };
  select: Record<string, unknown>;
  include?: unknown;
};

type PublicCountArgs = {
  where: PublicFindManyArgs['where'];
};

const getPublicFindManyArgs = (
  mock: jest.MockedFunction<(args: PublicFindManyArgs) => unknown>,
): PublicFindManyArgs => mock.mock.calls[0][0];

const getPublicCountArgs = (
  mock: jest.MockedFunction<(args: PublicCountArgs) => unknown>,
): PublicCountArgs => mock.mock.calls[0][0];

const createDto = {
  title: 'Summer Lights Festival',
  description: 'Outdoor show',
  venue: 'City Arena',
  address: '123 Main Street',
  startTime,
  endTime,
  saleStartAt,
  saleEndAt,
  posterUrl: 'https://example.com/poster.jpg',
};

describe('ConcertsService', () => {
  const prisma = {
    concert: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: ConcertsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.concert.findMany.mockReturnValue('findManyPromise');
    prisma.concert.count.mockReturnValue('countPromise');
    service = new ConcertsService(prisma as never);
  });

  it('creates a draft concert successfully', async () => {
    prisma.concert.create.mockResolvedValue(baseConcert);

    const result = await service.create(createDto, operator);

    expect(result).toMatchObject({
      id: 'concert-id',
      status: ConcertStatus.DRAFT,
      publishedAt: null,
    });
  });

  it('associates the authenticated operator as creator', async () => {
    prisma.concert.create.mockResolvedValue(baseConcert);

    await service.create(createDto, operator);

    expect(prisma.concert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: operator.id,
          status: ConcertStatus.DRAFT,
          publishedAt: null,
        }) as { createdById: string; status: ConcertStatus; publishedAt: null },
      }),
    );
  });

  it('rejects startTime greater than or equal to endTime', async () => {
    await expect(
      service.create(
        {
          ...createDto,
          startTime: endTime,
          endTime: startTime,
        },
        operator,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid sale period', async () => {
    await expect(
      service.create(
        {
          ...createDto,
          saleStartAt: saleEndAt,
          saleEndAt: saleStartAt,
        },
        operator,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects saleEndAt later than startTime', async () => {
    await expect(
      service.create(
        {
          ...createDto,
          saleEndAt: '2026-08-01T20:00:00.000Z',
        },
        operator,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists concerts with pagination', async () => {
    prisma.$transaction.mockResolvedValue([[baseConcert], 1]);

    const result = await service.findAll({ page: 2, limit: 10 });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'findManyPromise',
      'countPromise',
    ]);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('applies search filter', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({ search: 'arena' });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { title: { contains: 'arena', mode: 'insensitive' } },
            { venue: { contains: 'arena', mode: 'insensitive' } },
          ]) as unknown[],
        }) as { OR: unknown[] },
      }),
    );
  });

  it('applies status filter', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({ status: ConcertStatus.PUBLISHED });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: ConcertStatus.PUBLISHED },
      }),
    );
  });

  it('applies date range filter', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
    });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startTime: {
            gte: new Date('2026-08-01T00:00:00.000Z'),
            lte: new Date('2026-08-31T23:59:59.999Z'),
          },
        },
      }),
    );
  });

  it('returns concert details with ticket categories', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [
        {
          id: 'category-id',
          concertId: 'concert-id',
          name: 'General Admission',
          description: null,
          price: decimal,
          quantity: 100,
          sold: 0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const result = await service.findOne('concert-id');

    expect(result.ticketCategories).toEqual([
      expect.objectContaining({
        id: 'category-id',
        price: '49.99',
      }),
    ]);
  });

  it('returns 404 for missing concert', async () => {
    prisma.concert.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates a draft concert successfully', async () => {
    prisma.concert.findUnique.mockResolvedValue(baseConcert);
    prisma.concert.update.mockResolvedValue({
      ...baseConcert,
      title: 'Updated Festival',
    });

    const result = await service.update('concert-id', {
      title: 'Updated Festival',
    });

    expect(prisma.concert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { title: 'Updated Festival' },
      }),
    );
    expect(result.title).toBe('Updated Festival');
  });

  it('merges existing and supplied dates before validation', async () => {
    prisma.concert.findUnique.mockResolvedValue(baseConcert);

    await expect(
      service.update('concert-id', {
        startTime: '2026-08-01T23:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects update of a published concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      status: ConcertStatus.PUBLISHED,
    });

    await expect(
      service.update('concert-id', { title: 'Updated Festival' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects update of a cancelled concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      status: ConcertStatus.CANCELLED,
    });

    await expect(
      service.update('concert-id', { title: 'Updated Festival' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes a draft concert successfully', async () => {
    prisma.concert.findUnique.mockResolvedValue(baseConcert);
    prisma.concert.delete.mockResolvedValue(baseConcert);

    await service.remove('concert-id');

    expect(prisma.concert.delete).toHaveBeenCalledWith({
      where: { id: 'concert-id' },
    });
  });

  it('rejects deletion of a published concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      status: ConcertStatus.PUBLISHED,
    });

    await expect(service.remove('concert-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects deletion of a cancelled concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      status: ConcertStatus.CANCELLED,
    });

    await expect(service.remove('concert-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('publishes a valid draft concert successfully', async () => {
    prisma.concert.findUnique
      .mockResolvedValueOnce({
        ...baseConcert,
        ticketCategories: [baseCategory],
      })
      .mockResolvedValueOnce({
        ...baseConcert,
        status: ConcertStatus.PUBLISHED,
        publishedAt: now,
        ticketCategories: [baseCategory],
      });
    prisma.concert.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.publish('concert-id');

    expect(result.status).toBe(ConcertStatus.PUBLISHED);
  });

  it('sets publishedAt when publishing', async () => {
    prisma.concert.findUnique
      .mockResolvedValueOnce({
        ...baseConcert,
        ticketCategories: [baseCategory],
      })
      .mockResolvedValueOnce({
        ...baseConcert,
        status: ConcertStatus.PUBLISHED,
        publishedAt: now,
        ticketCategories: [baseCategory],
      });
    prisma.concert.updateMany.mockResolvedValue({ count: 1 });

    await service.publish('concert-id');

    expect(prisma.concert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAt: expect.any(Date) as Date,
        }) as { publishedAt: Date },
      }),
    );
  });

  it('preserves unrelated concert fields when publishing', async () => {
    prisma.concert.findUnique
      .mockResolvedValueOnce({
        ...baseConcert,
        ticketCategories: [baseCategory],
      })
      .mockResolvedValueOnce({
        ...baseConcert,
        title: 'Summer Lights Festival',
        status: ConcertStatus.PUBLISHED,
        publishedAt: now,
        ticketCategories: [baseCategory],
      });
    prisma.concert.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.publish('concert-id');

    expect(result.title).toBe('Summer Lights Festival');
    expect(result.venue).toBe('City Arena');
  });

  it('returns the published concert detail', async () => {
    prisma.concert.findUnique
      .mockResolvedValueOnce({
        ...baseConcert,
        ticketCategories: [baseCategory],
      })
      .mockResolvedValueOnce({
        ...baseConcert,
        status: ConcertStatus.PUBLISHED,
        publishedAt: now,
        ticketCategories: [baseCategory],
      });
    prisma.concert.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.publish('concert-id');

    expect(result.ticketCategories).toEqual([
      expect.objectContaining({
        id: 'category-id',
        price: '49.99',
      }),
    ]);
  });

  it('returns 404 when publishing a missing concert', async () => {
    prisma.concert.findUnique.mockResolvedValue(null);

    await expect(service.publish('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects publishing an already published concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      status: ConcertStatus.PUBLISHED,
      ticketCategories: [baseCategory],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects publishing a cancelled concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      status: ConcertStatus.CANCELLED,
      ticketCategories: [baseCategory],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects publishing a concert whose start time is now or in the past', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      startTime: new Date('2026-01-01T19:00:00.000Z'),
      endTime: new Date('2026-01-01T22:00:00.000Z'),
      ticketCategories: [baseCategory],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects publishing a concert with no ticket categories', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects publishing a concert with categories but none active', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [
        {
          ...baseCategory,
          isActive: false,
        },
      ],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a valid active category and additional inactive categories', async () => {
    prisma.concert.findUnique
      .mockResolvedValueOnce({
        ...baseConcert,
        ticketCategories: [
          baseCategory,
          {
            ...baseCategory,
            id: 'inactive-category-id',
            isActive: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        ...baseConcert,
        status: ConcertStatus.PUBLISHED,
        publishedAt: now,
        ticketCategories: [
          baseCategory,
          {
            ...baseCategory,
            id: 'inactive-category-id',
            isActive: false,
          },
        ],
      });
    prisma.concert.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.publish('concert-id')).resolves.toMatchObject({
      status: ConcertStatus.PUBLISHED,
    });
  });

  it('rejects an active category with negative price', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [
        {
          ...baseCategory,
          price: negativeDecimal,
        },
      ],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an active category with quantity below 1', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [
        {
          ...baseCategory,
          quantity: 0,
        },
      ],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an active category with negative sold count', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [
        {
          ...baseCategory,
          sold: -1,
        },
      ],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an active category where sold exceeds quantity', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [
        {
          ...baseCategory,
          quantity: 1,
          sold: 2,
        },
      ],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects invalid concert start and end times when publishing', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      startTime: new Date(endTime),
      endTime: new Date(startTime),
      ticketCategories: [baseCategory],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects invalid sale start and end times when publishing', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      saleStartAt: new Date(saleEndAt),
      saleEndAt: new Date(saleStartAt),
      ticketCategories: [baseCategory],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects sale end later than concert start when publishing', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      saleEndAt: new Date('2026-08-01T20:00:00.000Z'),
      ticketCategories: [baseCategory],
    });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('handles conditional update count of zero as conflict', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [baseCategory],
    });
    prisma.concert.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.publish('concert-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires both concert id and draft status in the publish update condition', async () => {
    prisma.concert.findUnique
      .mockResolvedValueOnce({
        ...baseConcert,
        ticketCategories: [baseCategory],
      })
      .mockResolvedValueOnce({
        ...baseConcert,
        status: ConcertStatus.PUBLISHED,
        publishedAt: now,
        ticketCategories: [baseCategory],
      });
    prisma.concert.updateMany.mockResolvedValue({ count: 1 });

    await service.publish('concert-id');

    expect(prisma.concert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'concert-id',
          status: ConcertStatus.DRAFT,
        },
      }),
    );
  });

  it('does not mutate ticket category data when publishing', async () => {
    prisma.concert.findUnique
      .mockResolvedValueOnce({
        ...baseConcert,
        ticketCategories: [baseCategory],
      })
      .mockResolvedValueOnce({
        ...baseConcert,
        status: ConcertStatus.PUBLISHED,
        publishedAt: now,
        ticketCategories: [baseCategory],
      });
    prisma.concert.updateMany.mockResolvedValue({ count: 1 });

    await service.publish('concert-id');

    expect(prisma.concert.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.concert.update).not.toHaveBeenCalled();
  });

  it('returns published non-ended concerts in public list', async () => {
    prisma.$transaction.mockResolvedValue([[baseConcert], 1]);

    const result = await service.findPublicAll({});

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ConcertStatus.PUBLISHED,
          endTime: expect.objectContaining({
            gt: expect.any(Date) as Date,
          }) as { gt: Date },
        }) as { status: ConcertStatus; endTime: { gt: Date } },
      }),
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'concert-id',
        title: 'Summer Lights Festival',
      }),
    ]);
  });

  it('excludes draft concerts from public list', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({});

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ConcertStatus.PUBLISHED,
        }) as { status: ConcertStatus },
      }),
    );
  });

  it('excludes cancelled concerts from public list', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({});

    expect(prisma.concert.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: ConcertStatus.PUBLISHED,
      }) as { status: ConcertStatus },
    });
  });

  it('excludes published concerts whose end time is now or in the past', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({});

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endTime: expect.objectContaining({
            gt: expect.any(Date) as Date,
          }) as { gt: Date },
        }) as { endTime: { gt: Date } },
      }),
    );
  });

  it('includes currently running concerts whose end time is in the future', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        {
          ...baseConcert,
          startTime: new Date('2026-01-01T19:00:00.000Z'),
          endTime: new Date('2027-01-01T22:00:00.000Z'),
        },
      ],
      1,
    ]);

    const result = await service.findPublicAll({});

    expect(result.data).toHaveLength(1);
  });

  it('applies public search filter', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({ search: 'arena' });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { title: { contains: 'arena', mode: 'insensitive' } },
            { venue: { contains: 'arena', mode: 'insensitive' } },
            { address: { contains: 'arena', mode: 'insensitive' } },
          ]) as unknown[],
        }) as { OR: unknown[] },
      }),
    );
  });

  it('applies public from filter', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({ from: '2027-01-01T00:00:00.000Z' });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startTime: {
            gte: new Date('2027-01-01T00:00:00.000Z'),
          },
        }) as { startTime: { gte: Date } },
      }),
    );
  });

  it('applies public to filter', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({ to: '2027-12-31T23:59:59.999Z' });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startTime: {
            lte: new Date('2027-12-31T23:59:59.999Z'),
          },
        }) as { startTime: { lte: Date } },
      }),
    );
  });

  it('respects public sort field and direction', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({ sortBy: 'title', sortOrder: 'desc' });

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ title: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('uses startTime asc as the public default order', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({});

    expect(prisma.concert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns public pagination metadata', async () => {
    prisma.$transaction.mockResolvedValue([[baseConcert], 21]);

    const result = await service.findPublicAll({ page: 2, limit: 20 });

    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    });
  });

  it('uses identical public filters for count and list', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({ search: 'festival' });

    const findManyArgs = getPublicFindManyArgs(
      prisma.concert.findMany as jest.MockedFunction<
        (args: PublicFindManyArgs) => unknown
      >,
    );
    const countArgs = getPublicCountArgs(
      prisma.concert.count as jest.MockedFunction<
        (args: PublicCountArgs) => unknown
      >,
    );

    expect(countArgs.where).toBe(findManyArgs.where);
  });

  it('captures and reuses one current-time boundary for public list', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({});

    const findManyArgs = getPublicFindManyArgs(
      prisma.concert.findMany as jest.MockedFunction<
        (args: PublicFindManyArgs) => unknown
      >,
    );
    const countArgs = getPublicCountArgs(
      prisma.concert.count as jest.MockedFunction<
        (args: PublicCountArgs) => unknown
      >,
    );

    expect(countArgs.where.endTime.gt).toBe(findManyArgs.where.endTime.gt);
  });

  it('does not request creator relations or inactive categories for public list output', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findPublicAll({});

    const findManyArgs = getPublicFindManyArgs(
      prisma.concert.findMany as jest.MockedFunction<
        (args: PublicFindManyArgs) => unknown
      >,
    );

    expect(findManyArgs.include).toBeUndefined();
    expect(findManyArgs.select).not.toHaveProperty('createdBy');
    expect(findManyArgs.select).not.toHaveProperty('createdById');
    expect(findManyArgs.select).not.toHaveProperty('ticketCategories');
  });

  it('returns a published non-ended public concert detail', async () => {
    prisma.concert.findFirst.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [baseCategory],
    });

    const result = await service.findPublicOne('concert-id');

    expect(result).toMatchObject({
      id: 'concert-id',
      ticketCategories: [
        expect.objectContaining({
          id: 'category-id',
        }),
      ],
    });
  });

  it('returns 404 for a missing public concert detail', async () => {
    prisma.concert.findFirst.mockResolvedValue(null);

    await expect(service.findPublicOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 404 for draft, cancelled, and ended public concert details', async () => {
    prisma.concert.findFirst.mockResolvedValue(null);

    await expect(service.findPublicOne('hidden-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.concert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'hidden-id',
          status: ConcertStatus.PUBLISHED,
          endTime: {
            gt: expect.any(Date) as Date,
          },
        },
      }),
    );
  });

  it('includes only active ticket categories in public detail query', async () => {
    prisma.concert.findFirst.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [baseCategory],
    });

    await service.findPublicOne('concert-id');

    expect(prisma.concert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          ticketCategories: expect.objectContaining({
            where: { isActive: true },
          }) as { where: { isActive: boolean } },
        }) as Record<string, unknown>,
      }),
    );
  });

  it('orders public categories deterministically', async () => {
    prisma.concert.findFirst.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [baseCategory],
    });

    await service.findPublicOne('concert-id');

    expect(prisma.concert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          ticketCategories: expect.objectContaining({
            orderBy: [{ price: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          }) as { orderBy: unknown[] },
        }) as Record<string, unknown>,
      }),
    );
  });

  it('does not expose sold or creator data in public detail', async () => {
    prisma.concert.findFirst.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [baseCategory],
    });

    const result = await service.findPublicOne('concert-id');

    expect(result).not.toHaveProperty('createdById');
    expect(result).not.toHaveProperty('createdBy');
    expect(result.ticketCategories[0]).not.toHaveProperty('sold');
  });

  it('preserves decimal price serialization in public detail', async () => {
    prisma.concert.findFirst.mockResolvedValue({
      ...baseConcert,
      ticketCategories: [baseCategory],
    });

    const result = await service.findPublicOne('concert-id');

    expect(result.ticketCategories[0].price).toBe('49.99');
  });
});
