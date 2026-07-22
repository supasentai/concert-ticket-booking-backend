import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { Role } from '../../generated/prisma/enums';
import { AuthService } from './auth.service';

jest.mock('../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const now = new Date('2026-07-22T00:00:00.000Z');
const digestToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

describe('AuthService', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };

      return values[key];
    }),
  };

  const jwtService = {
    signAsync: jest
      .fn()
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token')
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token'),
    verifyAsync: jest.fn(),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.signAsync.mockReset();
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token')
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');
    service = new AuthService(
      prisma as never,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('register hashes the password, creates CUSTOMER, and omits hashes', async () => {
    let capturedPasswordHash = '';
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(
      (args: { data: { passwordHash: string } }) => {
        capturedPasswordHash = args.data.passwordHash;

        return Promise.resolve({
          id: 'user-id',
          email: 'customer@example.com',
          fullName: 'Customer',
          role: Role.CUSTOMER,
          createdAt: now,
          updatedAt: now,
        });
      },
    );
    prisma.user.update.mockResolvedValue({});

    const result = await service.register({
      email: 'CUSTOMER@EXAMPLE.COM',
      password: 'Password123',
      fullName: 'Customer',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'customer@example.com',
          fullName: 'Customer',
          role: Role.CUSTOMER,
        }) as { email: string; fullName: string; role: Role },
      }),
    );
    await expect(
      bcrypt.compare('Password123', capturedPasswordHash),
    ).resolves.toBe(true);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('refreshTokenHash');
  });

  it('rejects duplicate registration', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

    await expect(
      service.register({
        email: 'customer@example.com',
        password: 'Password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login succeeds with valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'customer@example.com',
      passwordHash: await bcrypt.hash('Password123', 4),
      fullName: null,
      role: Role.CUSTOMER,
      createdAt: now,
      updatedAt: now,
    });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({
      email: 'customer@example.com',
      password: 'Password123',
    });

    expect(result.tokens.accessToken).toBe('access-token');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('login rejects an invalid password with a generic message', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'customer@example.com',
      passwordHash: await bcrypt.hash('Password123', 4),
      fullName: null,
      role: Role.CUSTOMER,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      service.login({
        email: 'customer@example.com',
        password: 'WrongPassword123',
      }),
    ).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
  });

  it('refresh validates the stored hash and rotates the token', async () => {
    const oldRefreshToken = 'old-refresh-token';
    const oldRefreshTokenHash = await bcrypt.hash(
      digestToken(oldRefreshToken),
      4,
    );

    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'customer@example.com',
      role: Role.CUSTOMER,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'customer@example.com',
      fullName: null,
      role: Role.CUSTOMER,
      refreshTokenHash: oldRefreshTokenHash,
      createdAt: now,
      updatedAt: now,
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.refresh(oldRefreshToken);

    expect(result.refreshToken).toBe('refresh-token');
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'user-id',
          refreshTokenHash: oldRefreshTokenHash,
        },
        data: expect.objectContaining({
          refreshTokenHash: expect.any(String) as string,
        }) as { refreshTokenHash: string },
      }),
    );
  });

  it('refresh rejects when the stored hash does not match', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'customer@example.com',
      role: Role.CUSTOMER,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'customer@example.com',
      fullName: null,
      role: Role.CUSTOMER,
      refreshTokenHash: await bcrypt.hash(digestToken('different-token'), 4),
      createdAt: now,
      updatedAt: now,
    });

    await expect(service.refresh('old-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout clears the refresh-token hash', async () => {
    prisma.user.update.mockResolvedValue({});

    await service.logout({
      id: 'user-id',
      email: 'customer@example.com',
      role: Role.CUSTOMER,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { refreshTokenHash: null },
    });
  });
});
