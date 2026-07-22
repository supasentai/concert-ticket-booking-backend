import { Module } from '@nestjs/common';
import { VouchersModule } from '../vouchers/vouchers.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [VouchersModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
