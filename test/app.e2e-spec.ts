import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '../generated/prisma/enums';
import { AppModule } from '../src/app.module';

type AuthResponse = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: Role;
    createdAt: string;
    updatedAt: string;
    passwordHash?: string;
    refreshTokenHash?: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

type SafeUserResponse = AuthResponse['user'];

describe('Authentication and authorization (e2e)', () => {
  let app: INestApplication<App>;
  let pool: Pool;

  const runId = Date.now();
  const customerEmail = `customer-${runId}@example.com`;
  const operatorEmail = `operator-${runId}@example.com`;
  const roleAttemptEmail = `role-attempt-${runId}@example.com`;
  const password = 'Password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    await cleanupUsers();
    await pool.query(
      `INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "role", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"Role", now(), now())`,
      [
        randomUUID(),
        operatorEmail,
        await bcrypt.hash(password, 12),
        'Test Operator',
        Role.OPERATOR,
      ],
    );
  });

  afterAll(async () => {
    await cleanupUsers();
    await pool.end();
    await app.close();
  });

  it('supports the customer auth lifecycle and operator-only user listing', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: customerEmail.toUpperCase(),
        password,
        fullName: 'Test Customer',
      })
      .expect(201);
    const registered = registerResponse.body as AuthResponse;

    expect(registered.user.email).toBe(customerEmail);
    expect(registered.user.role).toBe(Role.CUSTOMER);
    expect(registered.user.passwordHash).toBeUndefined();
    expect(registered.user.refreshTokenHash).toBeUndefined();
    expect(registered.tokens.accessToken).toEqual(expect.any(String));
    expect(registered.tokens.refreshToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: roleAttemptEmail,
        password,
        role: Role.OPERATOR,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: customerEmail,
        password,
      })
      .expect(409);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: customerEmail,
        password,
      })
      .expect(200);
    const loggedIn = loginResponse.body as AuthResponse;

    expect(loggedIn.user.passwordHash).toBeUndefined();
    expect(loggedIn.user.refreshTokenHash).toBeUndefined();

    await request(app.getHttpServer()).get('/users/me').expect(401);

    const meResponse = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${loggedIn.tokens.accessToken}`)
      .expect(200);

    const me = meResponse.body as SafeUserResponse;

    expect(me).toMatchObject({
      email: customerEmail,
      role: Role.CUSTOMER,
    });
    expect(me.passwordHash).toBeUndefined();
    expect(me.refreshTokenHash).toBeUndefined();

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loggedIn.tokens.refreshToken })
      .expect(200);
    const refreshed = refreshResponse.body as AuthResponse['tokens'];

    expect(refreshed.accessToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).not.toBe(loggedIn.tokens.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loggedIn.tokens.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .expect(403);

    const operatorLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: operatorEmail,
        password,
      })
      .expect(200);
    const operator = operatorLoginResponse.body as AuthResponse;

    const usersResponse = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
      .expect(200);

    expect(Array.isArray(usersResponse.body)).toBe(true);
    for (const user of usersResponse.body as AuthResponse['user'][]) {
      expect(user.passwordHash).toBeUndefined();
      expect(user.refreshTokenHash).toBeUndefined();
    }

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.refreshToken })
      .expect(401);
  });

  async function cleanupUsers(): Promise<void> {
    if (!pool) {
      return;
    }

    for (const email of [customerEmail, operatorEmail, roleAttemptEmail]) {
      await pool.query('DELETE FROM "User" WHERE email = $1', [email]);
    }
  }
});
