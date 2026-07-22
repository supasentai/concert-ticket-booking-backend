import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../../../generated/prisma/enums';

export class BookingItemResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  ticketCategoryId: string;

  @ApiProperty({ example: 'General Admission' })
  ticketCategoryName: string;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: '49.99' })
  unitPrice: string;

  @ApiProperty({ example: '99.98' })
  lineTotal: string;
}

export class BookingResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  userId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  concertId: string;

  @ApiProperty({ example: 'Summer Lights Festival' })
  concertTitle: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.PENDING })
  status: BookingStatus;

  @ApiProperty({ example: '99.98' })
  totalAmount: string;

  @ApiProperty({ type: BookingItemResponseDto, isArray: true })
  items: BookingItemResponseDto[];

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  updatedAt: Date;
}
