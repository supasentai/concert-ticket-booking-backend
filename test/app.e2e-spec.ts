import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConcertStatus, Role } from '../generated/prisma/enums';
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

type ConcertResponse = {
  id: string;
  title: string;
  venue: string;
  status: ConcertStatus;
  createdById: string | null;
  publishedAt: string | null;
  ticketCategories?: TicketCategoryResponse[];
};

type TicketCategoryResponse = {
  id: string;
  concertId?: string;
  name: string;
  price: string;
  quantity?: number;
  sold?: number;
  isActive?: boolean;
};

type PaginatedConcertResponse = {
  data: ConcertResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type PublicConcertResponse = {
  id: string;
  title: string;
  venue: string;
  publishedAt: string | null;
  createdById?: string;
  createdBy?: unknown;
  status?: ConcertStatus;
  ticketCategories?: TicketCategoryResponse[];
};

type PaginatedPublicConcertResponse = {
  data: PublicConcertResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

describe('Phase 02 concert management (e2e)', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let operator: AuthResponse;
  let customer: AuthResponse;
  let publishedConcert: ConcertResponse;
  let publishedCategory: TicketCategoryResponse;
  let inactivePublishedCategory: TicketCategoryResponse;
  let draftConcert: ConcertResponse;
  let cancelledConcert: ConcertResponse;
  let endedConcert: ConcertResponse;
  let noCategoryConcert: ConcertResponse;
  let inactiveOnlyConcert: ConcertResponse;

  const runId = Date.now();
  const titlePrefix = `E2E Phase02 ${runId}`;
  const customerEmail = `customer-${runId}@example.com`;
  const operatorEmail = `operator-${runId}@example.com`;
  const authCustomerEmail = `auth-customer-${runId}@example.com`;
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

    await cleanupConcerts();
    await cleanupUsers();
    await insertUser(operatorEmail, Role.OPERATOR);
    await insertUser(customerEmail, Role.CUSTOMER);

    operator = await login(operatorEmail);
    customer = await login(customerEmail);
    await createSharedFixtures();
  });

  afterAll(async () => {
    await cleanupConcerts();
    await cleanupUsers();
    await pool.end();
    await app.close();
  });

  describe('authentication and authorization', () => {
    it('keeps operator routes protected for unauthenticated users', async () => {
      await request(app.getHttpServer()).get('/operator/concerts').expect(401);
      await request(app.getHttpServer())
        .patch(`/operator/concerts/${publishedConcert.id}/publish`)
        .expect(401);
    });

    it('returns 403 for customers on operator routes', async () => {
      await request(app.getHttpServer())
        .get('/operator/concerts')
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(403);
    });

    it('allows anonymous, customer, and operator access to public routes', async () => {
      await request(app.getHttpServer()).get('/concerts').expect(200);
      await request(app.getHttpServer())
        .get(`/concerts/${publishedConcert.id}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/concerts')
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/concerts/${publishedConcert.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
    });

    it('keeps registration and refresh-token protections intact', async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: authCustomerEmail.toUpperCase(),
          password,
          fullName: 'Auth Customer',
        })
        .expect(201);
      const registered = registerResponse.body as AuthResponse;

      expect(registered.user.email).toBe(authCustomerEmail);
      expect(registered.user.role).toBe(Role.CUSTOMER);
      expect(registered.user.passwordHash).toBeUndefined();
      expect(registered.user.refreshTokenHash).toBeUndefined();

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
          email: authCustomerEmail,
          password,
        })
        .expect(409);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: authCustomerEmail,
          password,
        })
        .expect(200);
      const loggedIn = loginResponse.body as AuthResponse;

      await request(app.getHttpServer()).get('/users/me').expect(401);
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${loggedIn.tokens.accessToken}`)
        .expect(200);

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loggedIn.tokens.refreshToken })
        .expect(200);
      const refreshed = refreshResponse.body as AuthResponse['tokens'];

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loggedIn.tokens.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${refreshed.accessToken}`)
        .expect(204);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: refreshed.refreshToken })
        .expect(401);
    });
  });

  describe('operator concert CRUD', () => {
    it('creates draft concerts and rejects protected field injection', async () => {
      await request(app.getHttpServer())
        .post('/operator/concerts')
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({
          title: `${titlePrefix} Injected Concert`,
          venue: 'Injection Arena',
          startTime: '2028-01-01T19:00:00.000Z',
          endTime: '2028-01-01T22:00:00.000Z',
          status: ConcertStatus.PUBLISHED,
          createdById: customer.user.id,
        })
        .expect(400);

      const concert = await createConcert(`${titlePrefix} Created Concert`);

      expect(concert.status).toBe(ConcertStatus.DRAFT);
      expect(concert.publishedAt).toBeNull();
      expect(concert.createdById).toBe(operator.user.id);
    });

    it('lists and views operator concert details', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/operator/concerts')
        .query({
          search: `${titlePrefix} Public Concert`,
          status: ConcertStatus.PUBLISHED,
          page: 1,
          limit: 10,
        })
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
      const list = listResponse.body as PaginatedConcertResponse;

      expect(list.meta).toMatchObject({ page: 1, limit: 10 });
      expect(
        list.data.some((concert) => concert.id === publishedConcert.id),
      ).toBe(true);

      const detailResponse = await request(app.getHttpServer())
        .get(`/operator/concerts/${publishedConcert.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
      const detail = detailResponse.body as ConcertResponse;

      expect(detail.id).toBe(publishedConcert.id);
      expect(detail.ticketCategories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: publishedCategory.id }),
          expect.objectContaining({ id: inactivePublishedCategory.id }),
        ]),
      );
    });

    it('updates a draft concert', async () => {
      const concert = await createConcert(`${titlePrefix} Update Concert`);

      const response = await request(app.getHttpServer())
        .patch(`/operator/concerts/${concert.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ title: `${titlePrefix} Updated Concert` })
        .expect(200);
      const updated = response.body as ConcertResponse;

      expect(updated.title).toBe(`${titlePrefix} Updated Concert`);
      expect(updated.status).toBe(ConcertStatus.DRAFT);
    });

    it('deletes a draft concert', async () => {
      const concert = await createConcert(`${titlePrefix} Delete Concert`);

      await request(app.getHttpServer())
        .delete(`/operator/concerts/${concert.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(204);
      await request(app.getHttpServer())
        .get(`/operator/concerts/${concert.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(404);
    });
  });

  describe('operator ticket category CRUD', () => {
    it('creates categories and rejects protected field injection', async () => {
      await request(app.getHttpServer())
        .post(`/operator/concerts/${draftConcert.id}/ticket-categories`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({
          name: `${titlePrefix} Injected Category`,
          price: 49.99,
          quantity: 100,
          sold: 50,
          concertId: publishedConcert.id,
        })
        .expect(400);

      const category = await createCategory(
        draftConcert.id,
        `${titlePrefix} Created Category`,
      );

      expect(category).toMatchObject({
        concertId: draftConcert.id,
        name: `${titlePrefix} Created Category`,
        sold: 0,
      });
    });

    it('lists and views categories scoped to a concert', async () => {
      const category = await createCategory(
        draftConcert.id,
        `${titlePrefix} Scoped Category`,
      );

      const listResponse = await request(app.getHttpServer())
        .get(`/operator/concerts/${draftConcert.id}/ticket-categories`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
      const categories = listResponse.body as TicketCategoryResponse[];

      expect(
        categories.every((item) => item.concertId === draftConcert.id),
      ).toBe(true);
      expect(categories.map((item) => item.id)).toContain(category.id);

      await request(app.getHttpServer())
        .get(
          `/operator/concerts/${draftConcert.id}/ticket-categories/${category.id}`,
        )
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(
          `/operator/concerts/${publishedConcert.id}/ticket-categories/${category.id}`,
        )
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(404);
    });

    it('updates and deletes categories under draft concerts', async () => {
      const concert = await createConcert(
        `${titlePrefix} Category Delete Parent`,
      );
      const category = await createCategory(
        concert.id,
        `${titlePrefix} Category Delete`,
      );

      const updateResponse = await request(app.getHttpServer())
        .patch(
          `/operator/concerts/${concert.id}/ticket-categories/${category.id}`,
        )
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ name: `${titlePrefix} Category Updated`, quantity: 120 })
        .expect(200);
      const updated = updateResponse.body as TicketCategoryResponse;

      expect(updated).toMatchObject({
        name: `${titlePrefix} Category Updated`,
        quantity: 120,
      });

      await request(app.getHttpServer())
        .delete(
          `/operator/concerts/${concert.id}/ticket-categories/${category.id}`,
        )
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(204);
    });
  });

  describe('publish flow', () => {
    it('rejects publish without categories and with only inactive categories', async () => {
      await request(app.getHttpServer())
        .patch(`/operator/concerts/${noCategoryConcert.id}/publish`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/operator/concerts/${inactiveOnlyConcert.id}/publish`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(400);
    });

    it('publishes a valid draft concert and rejects repeated publish', async () => {
      const concert = await createConcert(`${titlePrefix} Publish Concert`);
      await createCategory(concert.id, `${titlePrefix} Publish GA`);

      const publishResponse = await request(app.getHttpServer())
        .patch(`/operator/concerts/${concert.id}/publish`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
      const published = publishResponse.body as ConcertResponse;

      expect(published.status).toBe(ConcertStatus.PUBLISHED);
      expect(published.publishedAt).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .patch(`/operator/concerts/${concert.id}/publish`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(409);
    });

    it('rejects category, concert update, and concert delete after publishing', async () => {
      await request(app.getHttpServer())
        .patch(
          `/operator/concerts/${publishedConcert.id}/ticket-categories/${publishedCategory.id}`,
        )
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ quantity: 121 })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/operator/concerts/${publishedConcert.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ title: `${titlePrefix} Should Not Update` })
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/operator/concerts/${publishedConcert.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(409);
    });
  });

  describe('public concert browsing and details', () => {
    it('shows published concerts with search and pagination metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/concerts')
        .query({
          search: `${titlePrefix} Public Concert`,
          page: 1,
          limit: 10,
        })
        .expect(200);
      const body = response.body as PaginatedPublicConcertResponse;

      expect(body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(body.data).toEqual([
        expect.objectContaining({
          id: publishedConcert.id,
          title: `${titlePrefix} Public Concert`,
        }),
      ]);
      expect(body.data[0]).not.toHaveProperty('createdById');
      expect(body.data[0]).not.toHaveProperty('createdBy');
    });

    it('hides draft, cancelled, and ended concerts from public browsing', async () => {
      await expectPublicSearchEmpty(`${titlePrefix} Draft Concert`);
      await expectPublicSearchEmpty(`${titlePrefix} Cancelled Concert`);
      await expectPublicSearchEmpty(`${titlePrefix} Ended Concert`);
    });

    it('returns public details with active categories only and no sensitive fields', async () => {
      const response = await request(app.getHttpServer())
        .get(`/concerts/${publishedConcert.id}`)
        .expect(200);
      const detail = response.body as PublicConcertResponse;

      expect(detail.id).toBe(publishedConcert.id);
      expect(detail).not.toHaveProperty('createdById');
      expect(detail).not.toHaveProperty('createdBy');
      expect(detail.ticketCategories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: publishedCategory.id,
            name: `${titlePrefix} Public GA`,
            price: '49.99',
          }),
        ]),
      );
      expect(
        detail.ticketCategories?.some(
          (category) => category.id === inactivePublishedCategory.id,
        ),
      ).toBe(false);
      expect(detail.ticketCategories?.[0]).not.toHaveProperty('sold');
    });

    it('returns 404 for hidden or unknown public details', async () => {
      await request(app.getHttpServer())
        .get(`/concerts/${draftConcert.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/concerts/${cancelledConcert.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/concerts/${endedConcert.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/concerts/${randomUUID()}`)
        .expect(404);
    });
  });

  async function createSharedFixtures(): Promise<void> {
    draftConcert = await createConcert(`${titlePrefix} Draft Concert`);
    noCategoryConcert = await createConcert(
      `${titlePrefix} No Category Concert`,
    );
    inactiveOnlyConcert = await createConcert(
      `${titlePrefix} Inactive Only Concert`,
    );
    await createCategory(
      inactiveOnlyConcert.id,
      `${titlePrefix} Inactive Only Category`,
      { isActive: false },
    );

    publishedConcert = await createConcert(`${titlePrefix} Public Concert`);
    publishedCategory = await createCategory(
      publishedConcert.id,
      `${titlePrefix} Public GA`,
      { price: 49.99, quantity: 120 },
    );
    await createCategory(publishedConcert.id, `${titlePrefix} Public VIP`, {
      price: 99.99,
      quantity: 40,
    });
    inactivePublishedCategory = await createCategory(
      publishedConcert.id,
      `${titlePrefix} Public Inactive`,
      { price: 5, quantity: 10, isActive: false },
    );
    publishedConcert = await publishConcert(publishedConcert.id);

    cancelledConcert = await createConcert(`${titlePrefix} Cancelled Concert`);
    await pool.query('UPDATE "Concert" SET status = $1 WHERE id = $2', [
      ConcertStatus.CANCELLED,
      cancelledConcert.id,
    ]);

    endedConcert = await createConcert(`${titlePrefix} Ended Concert`);
    await createCategory(endedConcert.id, `${titlePrefix} Ended GA`);
    endedConcert = await publishConcert(endedConcert.id);
    await pool.query(
      'UPDATE "Concert" SET "startTime" = $1, "endTime" = $2 WHERE id = $3',
      ['2026-01-01T19:00:00.000Z', '2026-01-01T22:00:00.000Z', endedConcert.id],
    );
  }

  async function createConcert(title: string): Promise<ConcertResponse> {
    const response = await request(app.getHttpServer())
      .post('/operator/concerts')
      .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
      .send({
        title,
        description: 'E2E concert fixture',
        venue: 'Fixture Arena',
        address: '123 Fixture Street',
        startTime: '2028-01-01T19:00:00.000Z',
        endTime: '2028-01-01T22:00:00.000Z',
        saleStartAt: '2027-12-01T00:00:00.000Z',
        saleEndAt: '2028-01-01T18:00:00.000Z',
        posterUrl: 'https://example.com/poster.jpg',
      })
      .expect(201);

    return response.body as ConcertResponse;
  }

  async function createCategory(
    concertId: string,
    name: string,
    overrides: Partial<{
      price: number;
      quantity: number;
      isActive: boolean;
    }> = {},
  ): Promise<TicketCategoryResponse> {
    const response = await request(app.getHttpServer())
      .post(`/operator/concerts/${concertId}/ticket-categories`)
      .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
      .send({
        name,
        description: 'E2E category fixture',
        price: overrides.price ?? 49.99,
        quantity: overrides.quantity ?? 100,
        isActive: overrides.isActive ?? true,
      })
      .expect(201);

    return response.body as TicketCategoryResponse;
  }

  async function publishConcert(concertId: string): Promise<ConcertResponse> {
    const response = await request(app.getHttpServer())
      .patch(`/operator/concerts/${concertId}/publish`)
      .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
      .expect(200);

    return response.body as ConcertResponse;
  }

  async function login(email: string): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body as AuthResponse;
  }

  async function insertUser(email: string, role: Role): Promise<void> {
    await pool.query(
      `INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "role", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"Role", now(), now())`,
      [
        randomUUID(),
        email,
        await bcrypt.hash(password, 12),
        role === Role.OPERATOR ? 'Test Operator' : 'Test Customer',
        role,
      ],
    );
  }

  async function expectPublicSearchEmpty(search: string): Promise<void> {
    await request(app.getHttpServer())
      .get('/concerts')
      .query({ search })
      .expect(200)
      .expect((response) => {
        const body = response.body as PaginatedPublicConcertResponse;

        expect(body.data).toHaveLength(0);
      });
  }

  async function cleanupUsers(): Promise<void> {
    for (const email of [
      authCustomerEmail,
      customerEmail,
      operatorEmail,
      roleAttemptEmail,
    ]) {
      await pool.query('DELETE FROM "User" WHERE email = $1', [email]);
    }
  }

  async function cleanupConcerts(): Promise<void> {
    await pool.query('DELETE FROM "Concert" WHERE title LIKE $1', [
      `${titlePrefix}%`,
    ]);
  }
});
