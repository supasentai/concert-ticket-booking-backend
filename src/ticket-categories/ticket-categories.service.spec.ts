import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConcertStatus } from '../../generated/prisma/enums';
import { TicketCategoriesService } from './ticket-categories.service';

jest.mock('../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const now = new Date('2026-07-22T00:00:00.000Z');
const concertId = 'concert-id';
const otherConcertId = 'other-concert-id';
const categoryId = 'category-id';

const draftConcert = {
  id: concertId,
  status: ConcertStatus.DRAFT,
};

const category = {
  id: categoryId,
  concertId,
  name: 'General Admission',
  description: 'Standing area',
  price: {
    toString: () => '49.99',
  },
  quantity: 100,
  sold: 10,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const createDto = {
  name: 'General Admission',
  description: 'Standing area',
  price: 49.99,
  quantity: 100,
  isActive: true,
};

describe('TicketCategoriesService', () => {
  const prisma = {
    concert: {
      findUnique: jest.fn(),
    },
    ticketCategory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  let service: TicketCategoriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.concert.findUnique.mockResolvedValue(draftConcert);
    prisma.ticketCategory.findFirst.mockResolvedValue(null);
    service = new TicketCategoriesService(prisma as never);
  });

  it('creates a category successfully under a draft concert', async () => {
    prisma.ticketCategory.create.mockResolvedValue(category);

    const result = await service.create(concertId, createDto);

    expect(result).toMatchObject({
      id: categoryId,
      concertId,
      name: 'General Admission',
      price: '49.99',
    });
  });

  it('forces sold to 0 during creation', async () => {
    prisma.ticketCategory.create.mockResolvedValue(category);

    await service.create(concertId, createDto);

    expect(prisma.ticketCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sold: 0,
        }) as { sold: number },
      }),
    );
  });

  it('associates the category using the route concert ID', async () => {
    prisma.ticketCategory.create.mockResolvedValue(category);

    await service.create(concertId, createDto);

    expect(prisma.ticketCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          concertId,
        }) as { concertId: string },
      }),
    );
  });

  it('returns 404 when the parent concert does not exist', async () => {
    prisma.concert.findUnique.mockResolvedValue(null);

    await expect(service.create(concertId, createDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects creation under a published concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      id: concertId,
      status: ConcertStatus.PUBLISHED,
    });

    await expect(service.create(concertId, createDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects creation under a cancelled concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      id: concertId,
      status: ConcertStatus.CANCELLED,
    });

    await expect(service.create(concertId, createDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects duplicate name in the same concert', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue({ id: 'existing-id' });

    await expect(service.create(concertId, createDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows the same category name in another concert', async () => {
    prisma.ticketCategory.create.mockResolvedValue({
      ...category,
      concertId: otherConcertId,
    });

    await service.create(otherConcertId, createDto);

    expect(prisma.ticketCategory.findFirst).toHaveBeenCalledWith({
      where: {
        concertId: otherConcertId,
        name: createDto.name,
      },
      select: {
        id: true,
      },
    });
  });

  it('maps Prisma unique constraint failure to 409', async () => {
    prisma.ticketCategory.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.create(concertId, createDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lists only categories from the requested concert', async () => {
    prisma.ticketCategory.findMany.mockResolvedValue([category]);

    await service.findAll(concertId);

    expect(prisma.ticketCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { concertId },
      }),
    );
  });

  it('lists categories in deterministic order', async () => {
    prisma.ticketCategory.findMany.mockResolvedValue([category]);

    await service.findAll(concertId);

    expect(prisma.ticketCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns category details scoped by both concert and category ID', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(category);

    const result = await service.findOne(concertId, categoryId);

    expect(prisma.ticketCategory.findFirst).toHaveBeenCalledWith({
      where: {
        id: categoryId,
        concertId,
      },
    });
    expect(result.id).toBe(categoryId);
  });

  it('returns 404 when a category belongs to another concert', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(otherConcertId, categoryId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a category under a draft concert', async () => {
    prisma.ticketCategory.findFirst
      .mockResolvedValueOnce(category)
      .mockResolvedValueOnce(null);
    prisma.ticketCategory.update.mockResolvedValue({
      ...category,
      name: 'VIP',
    });

    const result = await service.update(concertId, categoryId, { name: 'VIP' });

    expect(result.name).toBe('VIP');
  });

  it('preserves omitted fields during update', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(category);
    prisma.ticketCategory.update.mockResolvedValue({
      ...category,
      description: 'Updated',
    });

    await service.update(concertId, categoryId, { description: 'Updated' });

    expect(prisma.ticketCategory.update).toHaveBeenCalledWith({
      where: { id: categoryId },
      data: { description: 'Updated' },
    });
  });

  it('rejects update under a published concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      id: concertId,
      status: ConcertStatus.PUBLISHED,
    });

    await expect(
      service.update(concertId, categoryId, { name: 'VIP' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects update under a cancelled concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      id: concertId,
      status: ConcertStatus.CANCELLED,
    });

    await expect(
      service.update(concertId, categoryId, { name: 'VIP' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects quantity lower than current sold count', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(category);

    await expect(
      service.update(concertId, categoryId, { quantity: 9 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows quantity equal to current sold count', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(category);
    prisma.ticketCategory.update.mockResolvedValue({
      ...category,
      quantity: 10,
    });

    await expect(
      service.update(concertId, categoryId, { quantity: 10 }),
    ).resolves.toMatchObject({ quantity: 10 });
  });

  it('rejects rename to a duplicate category name', async () => {
    prisma.ticketCategory.findFirst
      .mockResolvedValueOnce(category)
      .mockResolvedValueOnce({ id: 'existing-id' });

    await expect(
      service.update(concertId, categoryId, { name: 'VIP' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows retaining the category current name', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(category);
    prisma.ticketCategory.update.mockResolvedValue(category);

    await service.update(concertId, categoryId, { name: category.name });

    expect(prisma.ticketCategory.findFirst).toHaveBeenCalledTimes(1);
  });

  it('deletes a category under a draft concert', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(category);
    prisma.ticketCategory.delete.mockResolvedValue(category);

    await service.remove(concertId, categoryId);

    expect(prisma.ticketCategory.delete).toHaveBeenCalledWith({
      where: { id: categoryId },
    });
  });

  it('rejects deletion under a published concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      id: concertId,
      status: ConcertStatus.PUBLISHED,
    });

    await expect(service.remove(concertId, categoryId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects deletion under a cancelled concert', async () => {
    prisma.concert.findUnique.mockResolvedValue({
      id: concertId,
      status: ConcertStatus.CANCELLED,
    });

    await expect(service.remove(concertId, categoryId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns 404 when deleting a category belonging to another concert', async () => {
    prisma.ticketCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.remove(otherConcertId, categoryId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
