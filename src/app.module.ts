import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ConcertsModule } from './concerts/concerts.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';
import { UsersModule } from './users/users.module';
import { VouchersModule } from './vouchers/vouchers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),

        PORT: Joi.number().port().default(3000),

        DATABASE_URL: Joi.string().required(),

        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string()
          .min(32)
          .invalid(Joi.ref('JWT_ACCESS_SECRET'))
          .required()
          .messages({
            'any.invalid':
              'JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET',
          }),
        JWT_REFRESH_EXPIRES_IN: Joi.string()
          .invalid(Joi.ref('JWT_ACCESS_EXPIRES_IN'))
          .required()
          .messages({
            'any.invalid':
              'JWT_REFRESH_EXPIRES_IN must be different from JWT_ACCESS_EXPIRES_IN',
          }),

        SEED_OPERATOR_EMAIL: Joi.string().email().required(),
        SEED_OPERATOR_PASSWORD: Joi.string().min(8).required(),
        SEED_OPERATOR_FULL_NAME: Joi.string().required(),
      }),
      validationOptions: {
        abortEarly: false,
      },
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    ConcertsModule,
    TicketCategoriesModule,
    BookingsModule,
    DashboardModule,
    VouchersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
