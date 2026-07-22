import { UsersService } from './users.service';

jest.mock('../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('UsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current safe user', async () => {
    const user = {
      id: 'user-id',
      email: 'customer@example.com',
      fullName: null,
      role: 'CUSTOMER',
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
      updatedAt: new Date('2026-07-22T00:00:00.000Z'),
    };
    prisma.user.findUnique.mockResolvedValue(user);
    const service = new UsersService(prisma as never);

    await expect(service.findMe('user-id')).resolves.toBe(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-id' },
      }),
    );
  });

  it('returns safe users only', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    const service = new UsersService(prisma as never);

    await expect(service.findAll()).resolves.toEqual([]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          passwordHash: true,
          refreshTokenHash: true,
        }) as Record<string, boolean>,
      }),
    );
  });
});
