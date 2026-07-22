import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoucherDiscountType } from '../../../generated/prisma/enums';

export class VoucherValidationResponseDto {
  @ApiProperty({ example: 'SUMMER20' })
  code: string;

  @ApiProperty({ enum: VoucherDiscountType })
  discountType: VoucherDiscountType;

  @ApiProperty({ example: '20.00' })
  discountValue: string;

  @ApiPropertyOptional({ example: '100000.00', nullable: true })
  maximumDiscountAmount: string | null;

  @ApiPropertyOptional({ example: '500000.00', nullable: true })
  minimumOrderAmount: string | null;

  @ApiProperty({ example: '500000.00' })
  subtotal: string;

  @ApiProperty({ example: '100000.00' })
  discountAmount: string;

  @ApiProperty({ example: '400000.00' })
  finalAmount: string;

  @ApiPropertyOptional({ example: 9, nullable: true })
  remainingQuantity: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  remainingUserUsage: number | null;

  @ApiProperty({ example: '2026-08-31T23:59:59.999Z' })
  expiresAt: Date;
}
