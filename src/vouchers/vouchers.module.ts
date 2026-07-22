import { Module } from '@nestjs/common';
import { VoucherValidationController } from './voucher-validation.controller';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';

@Module({
  controllers: [VoucherValidationController, VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
