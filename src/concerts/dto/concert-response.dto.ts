import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConcertStatus } from '../../../generated/prisma/enums';

export class ConcertCreatorResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'operator@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Example Operator', nullable: true })
  fullName: string | null;
}

export class TicketCategoryResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  concertId: string;

  @ApiProperty({ example: 'General Admission' })
  name: string;

  @ApiPropertyOptional({ example: 'Standing area access.', nullable: true })
  description: string | null;

  @ApiProperty({ example: '49.99' })
  price: string;

  @ApiProperty({ example: 500 })
  quantity: number;

  @ApiProperty({ example: 0 })
  sold: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-07-22T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-22T00:00:00.000Z' })
  updatedAt: Date;
}

export class ConcertResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Summer Lights Festival' })
  title: string;

  @ApiPropertyOptional({
    example: 'An outdoor evening concert.',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ example: 'City Arena' })
  venue: string;

  @ApiPropertyOptional({ example: '123 Main Street', nullable: true })
  address: string | null;

  @ApiProperty({ example: '2026-08-01T19:00:00.000Z' })
  startTime: Date;

  @ApiProperty({ example: '2026-08-01T22:00:00.000Z' })
  endTime: Date;

  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z', nullable: true })
  saleStartAt: Date | null;

  @ApiPropertyOptional({ example: '2026-08-01T18:00:00.000Z', nullable: true })
  saleEndAt: Date | null;

  @ApiPropertyOptional({
    example: 'https://example.com/posters/summer-lights.jpg',
    nullable: true,
  })
  posterUrl: string | null;

  @ApiProperty({ enum: ConcertStatus, example: ConcertStatus.DRAFT })
  status: ConcertStatus;

  @ApiPropertyOptional({ example: null, nullable: true })
  publishedAt: Date | null;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440002',
    nullable: true,
  })
  createdById: string | null;

  @ApiPropertyOptional({ type: ConcertCreatorResponseDto, nullable: true })
  createdBy?: ConcertCreatorResponseDto | null;

  @ApiPropertyOptional({ type: TicketCategoryResponseDto, isArray: true })
  ticketCategories?: TicketCategoryResponseDto[];

  @ApiProperty({ example: '2026-07-22T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-22T00:00:00.000Z' })
  updatedAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedConcertResponseDto {
  @ApiProperty({ type: ConcertResponseDto, isArray: true })
  data: ConcertResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
