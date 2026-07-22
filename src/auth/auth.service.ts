import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import type { SignOptions } from 'jsonwebtoken';
import { Role } from '../../generated/prisma/enums';
import { PrismaService } from '../common/prisma/prisma.service';
import { SAFE_USER_SELECT, SafeUser } from '../users/user-select';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

const PASSWORD_HASH_ROUNDS = 12;
const REFRESH_TOKEN_HASH_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const email = this.normalizeEmail(registerDto.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(
      registerDto.password,
      PASSWORD_HASH_ROUNDS,
    );
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: registerDto.fullName || null,
        role: Role.CUSTOMER,
      },
      select: SAFE_USER_SELECT,
    });

    return this.issueAndStoreTokens(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const email = this.normalizeEmail(loginDto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw this.invalidCredentials();
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw this.invalidCredentials();
    }

    return this.issueAndStoreTokens({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async refresh(refreshToken: string): Promise<TokenPairDto> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        ...SAFE_USER_SELECT,
        refreshTokenHash: true,
      },
    });

    if (!user?.refreshTokenHash) {
      throw this.invalidRefreshToken();
    }

    const isRefreshTokenValid = await this.compareRefreshToken(
      refreshToken,
      user.refreshTokenHash,
    );

    if (!isRefreshTokenValid) {
      throw this.invalidRefreshToken();
    }

    const tokens = await this.generateTokens(user);
    const refreshTokenHash = await this.hashRefreshToken(tokens.refreshToken);
    const updateResult = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        refreshTokenHash: user.refreshTokenHash,
      },
      data: { refreshTokenHash },
    });

    if (updateResult.count !== 1) {
      throw this.invalidRefreshToken();
    }

    return tokens;
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: null },
    });
  }

  private async issueAndStoreTokens(user: SafeUser): Promise<AuthResponseDto> {
    const tokens = await this.generateTokens(user);
    const refreshTokenHash = await this.hashRefreshToken(tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return { user, tokens };
  }

  private async generateTokens(user: SafeUser): Promise<TokenPairDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessTokenExpiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) as SignOptions['expiresIn'];
    const refreshTokenExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) as SignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessTokenExpiresIn,
        jwtid: randomUUID(),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTokenExpiresIn,
        jwtid: randomUUID(),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw this.invalidRefreshToken();
    }
  }

  private async hashRefreshToken(refreshToken: string): Promise<string> {
    return bcrypt.hash(
      this.digestRefreshToken(refreshToken),
      REFRESH_TOKEN_HASH_ROUNDS,
    );
  }

  private async compareRefreshToken(
    refreshToken: string,
    refreshTokenHash: string,
  ): Promise<boolean> {
    return bcrypt.compare(
      this.digestRefreshToken(refreshToken),
      refreshTokenHash,
    );
  }

  private digestRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid email or password');
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException('Invalid refresh token');
  }
}
