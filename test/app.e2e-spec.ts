import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  BookingStatus,
  ConcertStatus,
  Role,
  VoucherDiscountType,
  VoucherUsageStatus,
} from '../generated/prisma/enums';
import { AppModule } from '../src/app.module';

jest.setTimeout(60000);

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

type BookingResponse = {
  id: string;
  userId: string;
  concertId: string;
  concertTitle: string;
  status: BookingStatus;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  voucherCode: string | null;
  voucherDiscountType: VoucherDiscountType | null;
  voucherDiscountValue: string | null;
  voucherMaximumDiscountAmount: string | null;
  items: {
    id: string;
    ticketCategoryId: string;
    ticketCategoryName: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }[];
  createdAt: string;
  updatedAt: string;
  passwordHash?: string;
  refreshTokenHash?: string;
};

type VoucherResponse = {
  id: string;
  code: string;
  description: string | null;
  discountType: VoucherDiscountType;
  discountValue: string;
  maximumDiscountAmount: string | null;
  minimumOrderAmount: string | null;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  remainingQuantity: number | null;
  perUserUsageLimit: number | null;
  createdAt: string;
  updatedAt: string;
};

type PaginatedVoucherResponse = {
  data: VoucherResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type VoucherValidationResponse = {
  code: string;
  discountType: VoucherDiscountType;
  discountValue: string;
  maximumDiscountAmount: string | null;
  minimumOrderAmount: string | null;
  subtotal: string;
  discountAmount: string;
  finalAmount: string;
  remainingQuantity: number | null;
  remainingUserUsage: number | null;
  expiresAt: string;
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

describe('Concert ticket booking API (e2e)', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let operator: AuthResponse;
  let customer: AuthResponse;
  let otherCustomer: AuthResponse;
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
  const otherCustomerEmail = `other-customer-${runId}@example.com`;
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

    await cleanupVouchers();
    await cleanupConcerts();
    await cleanupUsers();
    await insertUser(operatorEmail, Role.OPERATOR);
    await insertUser(customerEmail, Role.CUSTOMER);
    await insertUser(otherCustomerEmail, Role.CUSTOMER);

    operator = await login(operatorEmail);
    customer = await login(customerEmail);
    otherCustomer = await login(otherCustomerEmail);
    await createSharedFixtures();
  });

  afterAll(async () => {
    await cleanupVouchers();
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

  describe('voucher management and validation preview', () => {
    it('protects operator voucher creation', async () => {
      await request(app.getHttpServer()).post('/vouchers').send({}).expect(401);

      await request(app.getHttpServer())
        .post('/vouchers')
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send(buildVoucherPayload(`${titlePrefix} CUSTOMER BLOCKED`))
        .expect(403);
    });

    it('allows operators to create percentage and fixed vouchers', async () => {
      const percentageResponse = await createVoucher(
        buildVoucherPayload(`${titlePrefix} percent create`, {
          discountType: VoucherDiscountType.PERCENTAGE,
          discountValue: '20.00',
          maximumDiscountAmount: '30.00',
        }),
      );
      const percentage = percentageResponse.body as VoucherResponse;

      expect(percentage).toMatchObject({
        code: normalizeVoucherCode(`${titlePrefix} percent create`),
        discountType: VoucherDiscountType.PERCENTAGE,
        discountValue: '20',
        maximumDiscountAmount: '30',
        usedCount: 0,
        remainingQuantity: 5,
      });

      const fixedResponse = await createVoucher(
        buildVoucherPayload(`${titlePrefix} fixed create`, {
          discountType: VoucherDiscountType.FIXED_AMOUNT,
          discountValue: '25.00',
          maximumDiscountAmount: null,
        }),
      );
      const fixed = fixedResponse.body as VoucherResponse;

      expect(fixed).toMatchObject({
        code: normalizeVoucherCode(`${titlePrefix} fixed create`),
        discountType: VoucherDiscountType.FIXED_AMOUNT,
        discountValue: '25',
      });
    });

    it('normalizes codes and rejects duplicate normalized codes', async () => {
      await createVoucher(buildVoucherPayload(` ${titlePrefix} Mixed Case `));

      await createVoucher(
        buildVoucherPayload(`${titlePrefix} mixed case`),
      ).expect(409);
    });

    it('rejects invalid voucher configurations and protected fields', async () => {
      await createVoucher(
        buildVoucherPayload(`${titlePrefix} Percent Too High`, {
          discountValue: '101.00',
        }),
      ).expect(400);

      await createVoucher(
        buildVoucherPayload(`${titlePrefix} Bad Dates`, {
          startsAt: '2028-01-02T00:00:00.000Z',
          expiresAt: '2028-01-01T00:00:00.000Z',
        }),
      ).expect(400);

      await createVoucher(
        buildVoucherPayload(`${titlePrefix} Bad Limits`, {
          usageLimit: 1,
          perUserUsageLimit: 2,
        }),
      ).expect(400);

      await createVoucher({
        ...buildVoucherPayload(`${titlePrefix} Protected Field`),
        usedCount: 1,
      }).expect(400);
    });

    it('lists, reads, updates, deactivates, and deletes unused vouchers', async () => {
      const createResponse = await createVoucher(
        buildVoucherPayload(`${titlePrefix} CRUD Voucher`),
      );
      const created = createResponse.body as VoucherResponse;

      const listResponse = await request(app.getHttpServer())
        .get('/vouchers')
        .query({ search: `${titlePrefix} CRUD`, page: 1, limit: 10 })
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
      const list = listResponse.body as PaginatedVoucherResponse;

      expect(list.data.map((voucher) => voucher.id)).toContain(created.id);

      const detailResponse = await request(app.getHttpServer())
        .get(`/vouchers/${created.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(200);
      expect((detailResponse.body as VoucherResponse).id).toBe(created.id);

      const updateResponse = await request(app.getHttpServer())
        .patch(`/vouchers/${created.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ description: 'Updated voucher', isActive: false })
        .expect(200);
      const updated = updateResponse.body as VoucherResponse;

      expect(updated.description).toBe('Updated voucher');
      expect(updated.isActive).toBe(false);

      await request(app.getHttpServer())
        .delete(`/vouchers/${created.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(204);
    });

    it('validates updates against final merged configuration', async () => {
      const createResponse = await createVoucher(
        buildVoucherPayload(`${titlePrefix} Merged Update`),
      );
      const voucher = createResponse.body as VoucherResponse;

      await request(app.getHttpServer())
        .patch(`/vouchers/${voucher.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ discountValue: '150.00' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/vouchers/${voucher.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ discountType: VoucherDiscountType.FIXED_AMOUNT })
        .expect(400);
    });

    it('rejects deleting vouchers with usage history', async () => {
      const voucherResponse = await createVoucher(
        buildVoucherPayload(`${titlePrefix} Delete History`),
      );
      const voucher = voucherResponse.body as VoucherResponse;
      const bookingFixture = await createPublishedBookingFixture(
        `${titlePrefix} Voucher Usage Booking`,
        2,
      );
      const bookingResponse = await createBooking(
        bookingFixture.concert.id,
        bookingFixture.category.id,
        1,
      );
      const booking = bookingResponse.body as BookingResponse;

      await insertVoucherUsage(voucher.id, customer.user.id, booking.id);

      await request(app.getHttpServer())
        .delete(`/vouchers/${voucher.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(409);
    });

    it('protects customer voucher validation preview', async () => {
      await request(app.getHttpServer())
        .post('/vouchers/validate')
        .send({})
        .expect(401);

      await request(app.getHttpServer())
        .post('/vouchers/validate')
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send(buildValidatePayload(`${titlePrefix} ANY`))
        .expect(403);
    });

    it('validates active vouchers without mutating counters or inventory', async () => {
      const voucherResponse = await createVoucher(
        buildVoucherPayload(`${titlePrefix} Preview Active`, {
          discountValue: '20.00',
          usageLimit: 5,
          perUserUsageLimit: 2,
        }),
      );
      const voucher = voucherResponse.body as VoucherResponse;
      const before = await readVoucherMutationState(
        voucher.id,
        publishedConcert.id,
        publishedCategory.id,
      );

      const response = await validateVoucher(voucher.code, [
        { ticketCategoryId: publishedCategory.id, quantity: 2 },
      ]);
      const body = response.body as VoucherValidationResponse;

      expect(body).toMatchObject({
        code: voucher.code,
        discountType: VoucherDiscountType.PERCENTAGE,
        subtotal: '99.98',
        discountAmount: '20',
        finalAmount: '79.98',
        remainingQuantity: 5,
        remainingUserUsage: 2,
      });

      await expectVoucherMutationState(
        voucher.id,
        publishedConcert.id,
        publishedCategory.id,
        before,
      );
    });

    it('rejects client-calculated totals and item unit prices', async () => {
      const voucherResponse = await createVoucher(
        buildVoucherPayload(`${titlePrefix} Preview Protected`),
      );
      const voucher = voucherResponse.body as VoucherResponse;

      await request(app.getHttpServer())
        .post('/vouchers/validate')
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send({
          ...buildValidatePayload(voucher.code),
          subtotal: '1.00',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/vouchers/validate')
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send({
          code: voucher.code,
          concertId: publishedConcert.id,
          items: [
            {
              ticketCategoryId: publishedCategory.id,
              quantity: 1,
              unitPrice: '1.00',
            },
          ],
        })
        .expect(400);
    });

    it('rejects inactive, future, expired, and exhausted vouchers', async () => {
      const inactive = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Inactive`, {
            isActive: false,
          }),
        )
      ).body as VoucherResponse;
      const future = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Future`, {
            startsAt: '2035-01-01T00:00:00.000Z',
            expiresAt: '2035-12-31T00:00:00.000Z',
          }),
        )
      ).body as VoucherResponse;
      const expired = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Expired`, {
            startsAt: '2026-01-01T00:00:00.000Z',
            expiresAt: '2026-01-02T00:00:00.000Z',
          }),
        )
      ).body as VoucherResponse;
      const exhausted = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Exhausted`, {
            usageLimit: 1,
            perUserUsageLimit: 1,
          }),
        )
      ).body as VoucherResponse;

      await pool.query('UPDATE "Voucher" SET "usedCount" = 1 WHERE id = $1', [
        exhausted.id,
      ]);

      await validateVoucher(inactive.code).expect(409);
      await validateVoucher(future.code).expect(409);
      await validateVoucher(expired.code).expect(409);
      await validateVoucher(exhausted.code).expect(409);
    });

    it('rejects per-user exhaustion and minimum order failures', async () => {
      const perUser = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Per User`, {
            perUserUsageLimit: 1,
          }),
        )
      ).body as VoucherResponse;
      const minimumOrder = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Minimum`, {
            minimumOrderAmount: '1000.00',
          }),
        )
      ).body as VoucherResponse;

      await insertVoucherUserUsage(perUser.id, customer.user.id, 1);

      await validateVoucher(perUser.code).expect(409);
      await validateVoucher(minimumOrder.code).expect(400);
    });

    it('applies maximum percentage caps and fixed discount floors', async () => {
      const capped = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Cap`, {
            discountValue: '50.00',
            maximumDiscountAmount: '10.00',
          }),
        )
      ).body as VoucherResponse;
      const fixed = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} Preview Fixed Floor`, {
            discountType: VoucherDiscountType.FIXED_AMOUNT,
            discountValue: '500.00',
            maximumDiscountAmount: null,
          }),
        )
      ).body as VoucherResponse;

      await validateVoucher(capped.code)
        .expect(200)
        .expect((response) => {
          const body = response.body as VoucherValidationResponse;

          expect(body.discountAmount).toBe('10');
          expect(body.finalAmount).toBe('39.99');
        });

      await validateVoucher(fixed.code)
        .expect(200)
        .expect((response) => {
          const body = response.body as VoucherValidationResponse;

          expect(body.discountAmount).toBe('49.99');
          expect(body.finalAmount).toBe('0');
        });
    });

    it('rejects invalid validation items', async () => {
      const voucher = (
        await createVoucher(buildVoucherPayload(`${titlePrefix} Preview Items`))
      ).body as VoucherResponse;
      const other = await createPublishedBookingFixture(
        `${titlePrefix} Preview Other Concert`,
        5,
      );

      await validateVoucher(voucher.code, [
        { ticketCategoryId: publishedCategory.id, quantity: 1 },
        { ticketCategoryId: publishedCategory.id, quantity: 1 },
      ]).expect(400);

      await validateVoucher(voucher.code, [
        { ticketCategoryId: other.category.id, quantity: 1 },
      ]).expect(404);

      await validateVoucher(voucher.code, [
        { ticketCategoryId: inactivePublishedCategory.id, quantity: 1 },
      ]).expect(409);
    });
  });

  describe('booking workflow', () => {
    it('rejects unauthenticated and operator booking creation', async () => {
      await request(app.getHttpServer()).post('/bookings').send({}).expect(401);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({
          concertId: publishedConcert.id,
          ticketCategoryId: publishedCategory.id,
          quantity: 1,
        })
        .expect(403);
    });

    it('creates a pending booking and atomically increases sold tickets', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Create`,
        5,
      );

      const response = await createBooking(concert.id, category.id, 2);
      const booking = response.body as BookingResponse;

      expect(booking).toMatchObject({
        userId: customer.user.id,
        concertId: concert.id,
        status: BookingStatus.PENDING,
        subtotal: '99.98',
        discountAmount: '0',
        totalAmount: '99.98',
        voucherCode: null,
      });
      expect(booking.items).toEqual([
        expect.objectContaining({
          ticketCategoryId: category.id,
          quantity: 2,
          unitPrice: '49.99',
          lineTotal: '99.98',
        }),
      ]);
      expect(booking.passwordHash).toBeUndefined();
      expect(booking.refreshTokenHash).toBeUndefined();
      await expectCategorySold(category.id, 2);
      await expectBookingUsageCount(booking.id, 0);

      const detailResponse = await request(app.getHttpServer())
        .get(`/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(200);
      expect((detailResponse.body as BookingResponse).id).toBe(booking.id);

      const listResponse = await request(app.getHttpServer())
        .get('/bookings/me')
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(200);
      const bookings = listResponse.body as BookingResponse[];
      expect(bookings.map((item) => item.id)).toContain(booking.id);
    });

    it('returns not found for invalid concerts and categories', async () => {
      const missingConcertId = randomUUID();

      await createBooking(missingConcertId, randomUUID(), 1).expect(404);

      await createBooking(publishedConcert.id, randomUUID(), 1).expect(404);
    });

    it('rejects unpublished concerts and mismatched categories', async () => {
      const draft = await createConcert(`${titlePrefix} Booking Draft Concert`);
      const draftCategory = await createCategory(
        draft.id,
        `${titlePrefix} Booking Draft GA`,
      );
      const other = await createPublishedBookingFixture(
        `${titlePrefix} Booking Other Concert`,
        5,
      );

      await createBooking(draft.id, draftCategory.id, 1).expect(409);
      await createBooking(publishedConcert.id, other.category.id, 1).expect(
        404,
      );
    });

    it('rejects invalid booking payloads and protected field injection', async () => {
      const invalidRequests = [
        { quantity: 0 },
        { quantity: -1 },
        { quantity: 1.5 },
        { concertId: 'not-a-uuid' },
        { status: BookingStatus.PAID },
      ];

      for (const override of invalidRequests) {
        await request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
          .send({
            concertId: publishedConcert.id,
            ticketCategoryId: publishedCategory.id,
            quantity: 1,
            ...override,
          })
          .expect(400);
      }
    });

    it('rejects insufficient tickets and rolls back the booking', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Insufficient`,
        1,
      );

      await createBooking(concert.id, category.id, 2).expect(409);

      await expectCategorySold(category.id, 0);
      await expectBookingCount(concert.id, 0);
    });

    it('prevents overselling with repeated reservations', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Oversell`,
        1,
      );

      await createBooking(concert.id, category.id, 1).expect(201);
      await createBooking(concert.id, category.id, 1).expect(409);

      await expectCategorySold(category.id, 1);
      await expectBookingCount(concert.id, 1);
    });

    it('prevents overselling under concurrent booking requests', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Concurrent Oversell`,
        2,
      );

      const responses = await Promise.all([
        createBooking(concert.id, category.id, 1),
        createBooking(concert.id, category.id, 1),
        createBooking(concert.id, category.id, 1),
        createBooking(concert.id, category.id, 1),
      ]);
      const statuses = responses.map((response) => response.status);

      expect(statuses.filter((status) => status === 201)).toHaveLength(2);
      expect(statuses.filter((status) => status === 409)).toHaveLength(2);
      await expectCategorySold(category.id, 2);
      await expectBookingCount(concert.id, 2);
      await expectBookingItemCount(concert.id, 2);
    });

    it('marks a pending booking paid and rejects duplicate payment', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Pay`,
        2,
      );
      const createResponse = await createBooking(concert.id, category.id, 1);
      const booking = createResponse.body as BookingResponse;

      const payResponse = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send({ success: true })
        .expect(200);

      expect((payResponse.body as BookingResponse).status).toBe(
        BookingStatus.PAID,
      );
      await expectCategorySold(category.id, 1);

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send({ success: true })
        .expect(409);
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(409);
    });

    it('applies a percentage voucher and stores booking snapshots', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Percent`,
        5,
      );
      const voucher = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING PERCENT`, {
            discountValue: '20.00',
            maximumDiscountAmount: null,
            usageLimit: 5,
            perUserUsageLimit: 2,
          }),
        )
      ).body as VoucherResponse;

      const response = await createBooking(
        concert.id,
        category.id,
        2,
        customer.tokens.accessToken,
        ` ${voucher.code.toLowerCase()} `,
      );
      const booking = response.body as BookingResponse;

      expect(booking).toMatchObject({
        subtotal: '99.98',
        discountAmount: '20',
        totalAmount: '79.98',
        voucherCode: voucher.code,
        voucherDiscountType: VoucherDiscountType.PERCENTAGE,
        voucherDiscountValue: '20',
        voucherMaximumDiscountAmount: null,
      });
      await expectCategorySold(category.id, 2);
      await expectVoucherState(voucher.id, customer.user.id, {
        usedCount: 1,
        activeUsageCount: 1,
        releasedUsageCount: 0,
        userUsedCount: 1,
      });
      await expectBookingUsageCount(booking.id, 1);
    });

    it('applies capped percentage and fixed vouchers without negative totals', async () => {
      const cappedFixture = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Cap`,
        5,
      );
      const capped = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING CAP`, {
            discountValue: '50.00',
            maximumDiscountAmount: '10.00',
          }),
        )
      ).body as VoucherResponse;
      const cappedBooking = (
        await createBooking(
          cappedFixture.concert.id,
          cappedFixture.category.id,
          1,
          customer.tokens.accessToken,
          capped.code,
        )
      ).body as BookingResponse;

      expect(cappedBooking.discountAmount).toBe('10');
      expect(cappedBooking.totalAmount).toBe('39.99');

      const fixedFixture = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Fixed`,
        5,
      );
      const fixed = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING FIXED`, {
            discountType: VoucherDiscountType.FIXED_AMOUNT,
            discountValue: '500.00',
            maximumDiscountAmount: null,
          }),
        )
      ).body as VoucherResponse;
      const fixedBooking = (
        await createBooking(
          fixedFixture.concert.id,
          fixedFixture.category.id,
          1,
          customer.tokens.accessToken,
          fixed.code,
        )
      ).body as BookingResponse;

      expect(fixedBooking.discountAmount).toBe('49.99');
      expect(fixedBooking.totalAmount).toBe('0');
    });

    it('keeps voucher booking snapshots stable after category and voucher changes', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Snapshot`,
        5,
      );
      const voucher = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING SNAPSHOT`, {
            discountValue: '25.00',
            maximumDiscountAmount: null,
          }),
        )
      ).body as VoucherResponse;
      const booking = (
        await createBooking(
          concert.id,
          category.id,
          1,
          customer.tokens.accessToken,
          voucher.code,
        )
      ).body as BookingResponse;

      await pool.query('UPDATE "TicketCategory" SET price = $1 WHERE id = $2', [
        '199.99',
        category.id,
      ]);
      await request(app.getHttpServer())
        .patch(`/vouchers/${voucher.id}`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ discountValue: '5.00', isActive: false })
        .expect(200);

      const detail = (
        await request(app.getHttpServer())
          .get(`/bookings/${booking.id}`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
          .expect(200)
      ).body as BookingResponse;

      expect(detail.subtotal).toBe('49.99');
      expect(detail.discountAmount).toBe('12.5');
      expect(detail.totalAmount).toBe('37.49');
      expect(detail.voucherDiscountValue).toBe('25');
    });

    it('rolls back voucher effects when voucher or ticket validation fails', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Rollback`,
        1,
      );
      const expired = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING EXPIRED`, {
            startsAt: '2026-01-01T00:00:00.000Z',
            expiresAt: '2026-01-02T00:00:00.000Z',
          }),
        )
      ).body as VoucherResponse;
      const valid = (
        await createVoucher(buildVoucherPayload(`${titlePrefix} BOOKING STOCK`))
      ).body as VoucherResponse;

      await createBooking(
        concert.id,
        category.id,
        1,
        customer.tokens.accessToken,
        expired.code,
      ).expect(409);
      await expectCategorySold(category.id, 0);
      await expectVoucherState(expired.id, customer.user.id, {
        usedCount: 0,
        activeUsageCount: 0,
        releasedUsageCount: 0,
        userUsedCount: 0,
      });

      await createBooking(
        concert.id,
        category.id,
        2,
        customer.tokens.accessToken,
        valid.code,
      ).expect(409);
      await expectCategorySold(category.id, 0);
      await expectVoucherState(valid.id, customer.user.id, {
        usedCount: 0,
        activeUsageCount: 0,
        releasedUsageCount: 0,
        userUsedCount: 0,
      });
      await expectBookingCount(concert.id, 0);
    });

    it('prevents concurrent global voucher overuse', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Global Race`,
        5,
      );
      const voucher = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING GLOBAL RACE`, {
            usageLimit: 1,
            perUserUsageLimit: 1,
          }),
        )
      ).body as VoucherResponse;

      const responses = await Promise.all([
        createBooking(
          concert.id,
          category.id,
          1,
          customer.tokens.accessToken,
          voucher.code,
        ),
        createBooking(
          concert.id,
          category.id,
          1,
          otherCustomer.tokens.accessToken,
          voucher.code,
        ),
      ]);
      const statuses = responses.map((response) => response.status);

      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(1);
      await expectCategorySold(category.id, 1);
      await expectVoucherAppliedInvariant(voucher.id);
    });

    it('prevents concurrent per-user voucher overuse', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher User Race`,
        5,
      );
      const voucher = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING USER RACE`, {
            usageLimit: 3,
            perUserUsageLimit: 2,
          }),
        )
      ).body as VoucherResponse;

      const responses = await Promise.all([
        createBooking(
          concert.id,
          category.id,
          1,
          customer.tokens.accessToken,
          voucher.code,
        ),
        createBooking(
          concert.id,
          category.id,
          1,
          customer.tokens.accessToken,
          voucher.code,
        ),
        createBooking(
          concert.id,
          category.id,
          1,
          customer.tokens.accessToken,
          voucher.code,
        ),
      ]);
      const statuses = responses.map((response) => response.status);

      expect(statuses.filter((status) => status === 201)).toHaveLength(2);
      expect(statuses.filter((status) => status === 409)).toHaveLength(1);
      await expectCategorySold(category.id, 2);
      await expectVoucherState(voucher.id, customer.user.id, {
        usedCount: 2,
        activeUsageCount: 2,
        releasedUsageCount: 0,
        userUsedCount: 2,
      });
    });

    it('releases voucher usage exactly once on pending cancellation', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Cancel`,
        5,
      );
      const voucher = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING CANCEL`, {
            usageLimit: 1,
            perUserUsageLimit: 1,
          }),
        )
      ).body as VoucherResponse;
      const booking = (
        await createBooking(
          concert.id,
          category.id,
          1,
          customer.tokens.accessToken,
          voucher.code,
        )
      ).body as BookingResponse;

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(200);
      await expectCategorySold(category.id, 0);
      await expectVoucherState(voucher.id, customer.user.id, {
        usedCount: 0,
        activeUsageCount: 0,
        releasedUsageCount: 1,
        userUsedCount: 0,
      });

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(409);

      await createBooking(
        concert.id,
        category.id,
        1,
        customer.tokens.accessToken,
        voucher.code,
      ).expect(201);
    });

    it('keeps voucher consumed after payment and handles pay-vs-cancel race', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Voucher Pay Race`,
        5,
      );
      const voucher = (
        await createVoucher(
          buildVoucherPayload(`${titlePrefix} BOOKING PAY RACE`),
        )
      ).body as VoucherResponse;
      const booking = (
        await createBooking(
          concert.id,
          category.id,
          1,
          customer.tokens.accessToken,
          voucher.code,
        )
      ).body as BookingResponse;

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/pay`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
          .send({ success: true }),
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`),
      ]);
      const statuses = responses.map((response) => response.status);
      const finalStatus = await getBookingStatus(booking.id);

      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(1);
      expect([BookingStatus.PAID, BookingStatus.CANCELLED]).toContain(
        finalStatus,
      );

      if (finalStatus === BookingStatus.PAID) {
        await expectCategorySold(category.id, 1);
        await expectVoucherState(voucher.id, customer.user.id, {
          usedCount: 1,
          activeUsageCount: 1,
          releasedUsageCount: 0,
          userUsedCount: 1,
        });
      } else {
        await expectCategorySold(category.id, 0);
        await expectVoucherState(voucher.id, customer.user.id, {
          usedCount: 0,
          activeUsageCount: 0,
          releasedUsageCount: 1,
          userUsedCount: 0,
        });
      }
    });

    it('rejects invalid payment payloads and protects ownership', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Payment Auth`,
        2,
      );
      const createResponse = await createBooking(concert.id, category.id, 1);
      const booking = createResponse.body as BookingResponse;

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send({ success: 'yes' })
        .expect(400);
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .send({ success: true })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${otherCustomer.tokens.accessToken}`)
        .send({ success: true })
        .expect(403);
    });

    it('prevents duplicate payment effects under concurrent requests', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Concurrent Pay`,
        2,
      );
      const createResponse = await createBooking(concert.id, category.id, 1);
      const booking = createResponse.body as BookingResponse;

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/pay`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
          .send({ success: true }),
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/pay`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
          .send({ success: true }),
      ]);
      const statuses = responses.map((response) => response.status);

      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(1);
      await expectBookingStatus(booking.id, BookingStatus.PAID);
      await expectCategorySold(category.id, 1);
    });

    it('fails mock payment by cancelling once and restoring stock once', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Failed Payment`,
        3,
      );
      const createResponse = await createBooking(concert.id, category.id, 2);
      const booking = createResponse.body as BookingResponse;

      await expectCategorySold(category.id, 2);

      const failedPaymentResponse = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send({ success: false })
        .expect(200);

      expect((failedPaymentResponse.body as BookingResponse).status).toBe(
        BookingStatus.CANCELLED,
      );
      await expectCategorySold(category.id, 0);

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .send({ success: true })
        .expect(409);
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(409);
      await expectCategorySold(category.id, 0);
    });

    it('cancels a pending booking and rejects duplicate cancellation', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Cancel`,
        4,
      );
      const createResponse = await createBooking(concert.id, category.id, 3);
      const booking = createResponse.body as BookingResponse;

      const cancelResponse = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(200);

      expect((cancelResponse.body as BookingResponse).status).toBe(
        BookingStatus.CANCELLED,
      );
      await expectCategorySold(category.id, 0);

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(409);
    });

    it('restores stock once under concurrent duplicate cancellation', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Concurrent Cancel`,
        3,
      );
      const createResponse = await createBooking(concert.id, category.id, 2);
      const booking = createResponse.body as BookingResponse;

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`),
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`),
      ]);
      const statuses = responses.map((response) => response.status);

      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(1);
      await expectBookingStatus(booking.id, BookingStatus.CANCELLED);
      await expectCategorySold(category.id, 0);
    });

    it('allows only one winner in a concurrent payment and cancellation race', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Pay Cancel Race`,
        2,
      );
      const createResponse = await createBooking(concert.id, category.id, 1);
      const booking = createResponse.body as BookingResponse;

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/pay`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
          .send({ success: true }),
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${customer.tokens.accessToken}`),
      ]);
      const statuses = responses.map((response) => response.status);
      const finalStatus = await getBookingStatus(booking.id);

      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(1);
      expect([BookingStatus.PAID, BookingStatus.CANCELLED]).toContain(
        finalStatus,
      );
      await expectCategorySold(
        category.id,
        finalStatus === BookingStatus.PAID ? 1 : 0,
      );
    });

    it('keeps booking price snapshots stable after category price changes', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Price Snapshot`,
        2,
      );
      const createResponse = await createBooking(concert.id, category.id, 1);
      const booking = createResponse.body as BookingResponse;

      await pool.query('UPDATE "TicketCategory" SET price = $1 WHERE id = $2', [
        '199.99',
        category.id,
      ]);

      const detailResponse = await request(app.getHttpServer())
        .get(`/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
        .expect(200);
      const detail = detailResponse.body as BookingResponse;

      expect(detail.totalAmount).toBe('49.99');
      expect(detail.items[0].unitPrice).toBe('49.99');
      expect(detail.items[0].lineTotal).toBe('49.99');
    });

    it('prevents customers from reading another customer booking', async () => {
      const { concert, category } = await createPublishedBookingFixture(
        `${titlePrefix} Booking Ownership`,
        2,
      );
      const createResponse = await createBooking(concert.id, category.id, 1);
      const booking = createResponse.body as BookingResponse;

      await request(app.getHttpServer())
        .get(`/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${otherCustomer.tokens.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/bookings/${booking.id}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/bookings/me')
        .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
        .expect(403);
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

  async function createPublishedBookingFixture(
    title: string,
    quantity: number,
  ): Promise<{ concert: ConcertResponse; category: TicketCategoryResponse }> {
    const concert = await createConcert(title);
    const category = await createCategory(concert.id, `${title} GA`, {
      price: 49.99,
      quantity,
    });
    const published = await publishConcert(concert.id);

    return { concert: published, category };
  }

  function createBooking(
    concertId: string,
    ticketCategoryId: string,
    quantity: number,
    accessToken = customer.tokens.accessToken,
    voucherCode?: string,
  ): request.Test {
    return request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        concertId,
        ticketCategoryId,
        quantity,
        ...(voucherCode ? { voucherCode } : {}),
      });
  }

  function buildVoucherPayload(
    code: string,
    overrides: Partial<{
      description: string | null;
      discountType: VoucherDiscountType;
      discountValue: string;
      maximumDiscountAmount: string | null;
      minimumOrderAmount: string | null;
      startsAt: string;
      expiresAt: string;
      isActive: boolean;
      usageLimit: number | null;
      perUserUsageLimit: number | null;
    }> = {},
  ): Record<string, unknown> {
    return {
      code,
      description: overrides.description ?? 'E2E voucher fixture',
      discountType: overrides.discountType ?? VoucherDiscountType.PERCENTAGE,
      discountValue: overrides.discountValue ?? '10.00',
      maximumDiscountAmount:
        overrides.maximumDiscountAmount === undefined
          ? '50.00'
          : overrides.maximumDiscountAmount,
      minimumOrderAmount:
        overrides.minimumOrderAmount === undefined
          ? '0.00'
          : overrides.minimumOrderAmount,
      startsAt: overrides.startsAt ?? '2026-07-01T00:00:00.000Z',
      expiresAt: overrides.expiresAt ?? '2028-12-31T23:59:59.999Z',
      isActive: overrides.isActive ?? true,
      usageLimit: overrides.usageLimit === undefined ? 5 : overrides.usageLimit,
      perUserUsageLimit:
        overrides.perUserUsageLimit === undefined
          ? 2
          : overrides.perUserUsageLimit,
    };
  }

  function createVoucher(payload: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post('/vouchers')
      .set('Authorization', `Bearer ${operator.tokens.accessToken}`)
      .send(payload);
  }

  function buildValidatePayload(
    code: string,
    items: { ticketCategoryId: string; quantity: number }[] = [
      { ticketCategoryId: publishedCategory.id, quantity: 1 },
    ],
  ): Record<string, unknown> {
    return {
      code,
      concertId: publishedConcert.id,
      items,
    };
  }

  function validateVoucher(
    code: string,
    items?: { ticketCategoryId: string; quantity: number }[],
  ): request.Test {
    return request(app.getHttpServer())
      .post('/vouchers/validate')
      .set('Authorization', `Bearer ${customer.tokens.accessToken}`)
      .send(buildValidatePayload(code, items));
  }

  function normalizeVoucherCode(code: string): string {
    return code.trim().toUpperCase();
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

  async function expectCategorySold(
    categoryId: string,
    sold: number,
  ): Promise<void> {
    const result = await pool.query<{ sold: number }>(
      'SELECT sold FROM "TicketCategory" WHERE id = $1',
      [categoryId],
    );

    expect(result.rows[0]?.sold).toBe(sold);
  }

  async function expectBookingCount(
    concertId: string,
    count: number,
  ): Promise<void> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Booking" WHERE "concertId" = $1',
      [concertId],
    );

    expect(Number(result.rows[0]?.count)).toBe(count);
  }

  async function expectBookingItemCount(
    concertId: string,
    count: number,
  ): Promise<void> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "BookingItem" item
       INNER JOIN "Booking" booking ON booking.id = item."bookingId"
       WHERE booking."concertId" = $1`,
      [concertId],
    );

    expect(Number(result.rows[0]?.count)).toBe(count);
  }

  async function getBookingStatus(bookingId: string): Promise<BookingStatus> {
    const result = await pool.query<{ status: BookingStatus }>(
      'SELECT status FROM "Booking" WHERE id = $1',
      [bookingId],
    );

    return result.rows[0].status;
  }

  async function expectBookingStatus(
    bookingId: string,
    status: BookingStatus,
  ): Promise<void> {
    await expect(getBookingStatus(bookingId)).resolves.toBe(status);
  }

  async function expectBookingUsageCount(
    bookingId: string,
    count: number,
  ): Promise<void> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "VoucherUsage" WHERE "bookingId" = $1',
      [bookingId],
    );

    expect(Number(result.rows[0]?.count)).toBe(count);
  }

  async function expectVoucherState(
    voucherId: string,
    userId: string,
    expected: {
      usedCount: number;
      activeUsageCount: number;
      releasedUsageCount: number;
      userUsedCount: number;
    },
  ): Promise<void> {
    const voucher = await pool.query<{ usedCount: number }>(
      'SELECT "usedCount" FROM "Voucher" WHERE id = $1',
      [voucherId],
    );
    const usages = await pool.query<{
      active: string;
      released: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'APPLIED')::text AS active,
         COUNT(*) FILTER (WHERE status = 'RELEASED')::text AS released
       FROM "VoucherUsage"
       WHERE "voucherId" = $1`,
      [voucherId],
    );
    const counter = await pool.query<{ usedCount: number }>(
      `SELECT "usedCount" FROM "VoucherUserUsage"
       WHERE "voucherId" = $1 AND "userId" = $2`,
      [voucherId, userId],
    );

    expect(voucher.rows[0]?.usedCount).toBe(expected.usedCount);
    expect(Number(usages.rows[0]?.active)).toBe(expected.activeUsageCount);
    expect(Number(usages.rows[0]?.released)).toBe(expected.releasedUsageCount);
    expect(counter.rows[0]?.usedCount ?? 0).toBe(expected.userUsedCount);
  }

  async function expectVoucherAppliedInvariant(
    voucherId: string,
  ): Promise<void> {
    const voucher = await pool.query<{ usedCount: number }>(
      'SELECT "usedCount" FROM "Voucher" WHERE id = $1',
      [voucherId],
    );
    const usages = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "VoucherUsage"
       WHERE "voucherId" = $1 AND status = 'APPLIED'`,
      [voucherId],
    );

    expect(voucher.rows[0]?.usedCount).toBe(Number(usages.rows[0]?.count));
  }

  async function insertVoucherUsage(
    voucherId: string,
    userId: string,
    bookingId: string,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO "VoucherUsage" ("id", "voucherId", "userId", "bookingId", "status", "createdAt")
       VALUES ($1, $2, $3, $4, $5::"VoucherUsageStatus", now())`,
      [randomUUID(), voucherId, userId, bookingId, VoucherUsageStatus.APPLIED],
    );
  }

  async function insertVoucherUserUsage(
    voucherId: string,
    userId: string,
    usedCount: number,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO "VoucherUserUsage" ("id", "voucherId", "userId", "usedCount", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [randomUUID(), voucherId, userId, usedCount],
    );
  }

  async function readVoucherMutationState(
    voucherId: string,
    concertId: string,
    categoryId: string,
  ): Promise<{
    usedCount: number;
    usageCount: number;
    userCounterCount: number;
    sold: number;
    bookingCount: number;
  }> {
    const voucher = await pool.query<{ usedCount: number }>(
      'SELECT "usedCount" FROM "Voucher" WHERE id = $1',
      [voucherId],
    );
    const usages = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "VoucherUsage" WHERE "voucherId" = $1',
      [voucherId],
    );
    const counters = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "VoucherUserUsage" WHERE "voucherId" = $1',
      [voucherId],
    );
    const category = await pool.query<{ sold: number }>(
      'SELECT sold FROM "TicketCategory" WHERE id = $1',
      [categoryId],
    );
    const bookings = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Booking" WHERE "concertId" = $1',
      [concertId],
    );

    return {
      usedCount: voucher.rows[0].usedCount,
      usageCount: Number(usages.rows[0].count),
      userCounterCount: Number(counters.rows[0].count),
      sold: category.rows[0].sold,
      bookingCount: Number(bookings.rows[0].count),
    };
  }

  async function expectVoucherMutationState(
    voucherId: string,
    concertId: string,
    categoryId: string,
    expected: Awaited<ReturnType<typeof readVoucherMutationState>>,
  ): Promise<void> {
    await expect(
      readVoucherMutationState(voucherId, concertId, categoryId),
    ).resolves.toEqual(expected);
  }

  async function cleanupUsers(): Promise<void> {
    for (const email of [
      authCustomerEmail,
      customerEmail,
      otherCustomerEmail,
      operatorEmail,
      roleAttemptEmail,
    ]) {
      await pool.query('DELETE FROM "User" WHERE email = $1', [email]);
    }
  }

  async function cleanupConcerts(): Promise<void> {
    await pool.query(
      'DELETE FROM "Booking" WHERE "concertId" IN (SELECT id FROM "Concert" WHERE title LIKE $1)',
      [`${titlePrefix}%`],
    );
    await pool.query('DELETE FROM "Concert" WHERE title LIKE $1', [
      `${titlePrefix}%`,
    ]);
  }

  async function cleanupVouchers(): Promise<void> {
    await pool.query(
      'DELETE FROM "VoucherUsage" WHERE "voucherId" IN (SELECT id FROM "Voucher" WHERE code LIKE $1)',
      [`%${runId}%`],
    );
    await pool.query(
      'DELETE FROM "VoucherUserUsage" WHERE "voucherId" IN (SELECT id FROM "Voucher" WHERE code LIKE $1)',
      [`%${runId}%`],
    );
    await pool.query(
      `UPDATE "Booking"
       SET "voucherId" = NULL,
           "voucherCodeSnapshot" = NULL,
           "voucherDiscountTypeSnapshot" = NULL,
           "voucherDiscountValueSnapshot" = NULL,
           "voucherMaximumDiscountAmountSnapshot" = NULL
       WHERE "voucherId" IN (SELECT id FROM "Voucher" WHERE code LIKE $1)`,
      [`%${runId}%`],
    );
    await pool.query('DELETE FROM "Voucher" WHERE code LIKE $1', [
      `%${runId}%`,
    ]);
  }
});
