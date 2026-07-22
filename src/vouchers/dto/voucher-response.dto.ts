import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoucherDiscountType } from '../../../generated/prisma/enums';
import { PaginationMetaDto } from '../../concerts/dto/concert-response.dto';

export class VoucherResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'SUMMER20' })
  code: string;

  @ApiPropertyOptional({ example: '20% discount.', nullable: true })
  description: string | null;

  @ApiProperty({ enum: VoucherDiscountType })
  discountType: VoucherDiscountType;

  @ApiProperty({ example: '20.00' })
  discountValue: string;

  @ApiPropertyOptional({ example: '100000.00', nullable: true })
  maximumDiscountAmount: string | null;

  @ApiPropertyOptional({ example: '500000.00', nullable: true })
  minimumOrderAmount: string | null;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  startsAt: Date;

  @ApiProperty({ example: '2026-08-31T23:59:59.999Z' })
  expiresAt: Date;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: 100, nullable: true })
  usageLimit: number | null;

  @ApiProperty({ example: 0 })
  usedCount: number;

  @ApiPropertyOptional({ example: 100, nullable: true })
  remainingQuantity: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  perUserUsageLimit: number | null;

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  updatedAt: Date;
}

export class PaginatedVoucherResponseDto {
  @ApiProperty({ type: VoucherResponseDto, isArray: true })
  data: VoucherResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
