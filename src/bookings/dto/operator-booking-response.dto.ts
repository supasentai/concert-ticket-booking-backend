import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingStatus,
  VoucherDiscountType,
  VoucherUsageStatus,
} from '../../../generated/prisma/enums';
import { PaginationMetaDto } from '../../concerts/dto/concert-response.dto';
import { BookingItemResponseDto } from './booking-response.dto';

export class OperatorBookingCustomerDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'customer@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Customer Name', nullable: true })
  fullName: string | null;
}

export class OperatorBookingConcertDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: 'Summer Lights Festival' })
  title: string;
}

export class OperatorBookingVoucherDto {
  @ApiPropertyOptional({ example: 'SAVE10', nullable: true })
  code: string | null;

  @ApiPropertyOptional({
    enum: VoucherDiscountType,
    nullable: true,
  })
  discountType: VoucherDiscountType | null;

  @ApiPropertyOptional({ example: '10', nullable: true })
  discountValue: string | null;

  @ApiPropertyOptional({ example: '100000', nullable: true })
  maximumDiscountAmount: string | null;

  @ApiPropertyOptional({
    enum: VoucherUsageStatus,
    nullable: true,
  })
  usageStatus: VoucherUsageStatus | null;
}

export class OperatorBookingResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  id: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.PENDING })
  status: BookingStatus;

  @ApiProperty({ type: OperatorBookingCustomerDto })
  customer: OperatorBookingCustomerDto;

  @ApiProperty({ type: OperatorBookingConcertDto })
  concert: OperatorBookingConcertDto;

  @ApiProperty({ example: 2 })
  totalQuantity: number;

  @ApiProperty({ example: '99.98' })
  subtotal: string;

  @ApiProperty({ example: '10' })
  discountAmount: string;

  @ApiProperty({ example: '89.98' })
  totalAmount: string;

  @ApiProperty({ type: OperatorBookingVoucherDto })
  voucher: OperatorBookingVoucherDto;

  @ApiProperty({ type: BookingItemResponseDto, isArray: true })
  items: BookingItemResponseDto[];

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  updatedAt: Date;
}

export class PaginatedOperatorBookingResponseDto {
  @ApiProperty({ type: OperatorBookingResponseDto, isArray: true })
  data: OperatorBookingResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
