import { Module } from '@nestjs/common';
import { VouchersModule } from '../vouchers/vouchers.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { OperatorBookingsController } from './operator-bookings.controller';

@Module({
  imports: [VouchersModule],
  controllers: [BookingsController, OperatorBookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
