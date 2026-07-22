import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicTicketCategoryResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'General Admission' })
  name: string;

  @ApiPropertyOptional({ example: 'Standing area access.', nullable: true })
  description: string | null;

  @ApiProperty({ example: '49.99' })
  price: string;
}

export class PublicConcertSummaryResponseDto {
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

  @ApiProperty({ example: '2027-08-01T19:00:00.000Z' })
  startTime: Date;

  @ApiProperty({ example: '2027-08-01T22:00:00.000Z' })
  endTime: Date;

  @ApiPropertyOptional({ example: '2027-07-01T00:00:00.000Z', nullable: true })
  saleStartAt: Date | null;

  @ApiPropertyOptional({ example: '2027-08-01T18:00:00.000Z', nullable: true })
  saleEndAt: Date | null;

  @ApiPropertyOptional({
    example: 'https://example.com/posters/summer-lights.jpg',
    nullable: true,
  })
  posterUrl: string | null;

  @ApiProperty({ example: '2026-07-22T00:00:00.000Z' })
  publishedAt: Date | null;
}

export class PublicConcertDetailResponseDto extends PublicConcertSummaryResponseDto {
  @ApiProperty({ type: PublicTicketCategoryResponseDto, isArray: true })
  ticketCategories: PublicTicketCategoryResponseDto[];
}

export class PublicConcertPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedPublicConcertResponseDto {
  @ApiProperty({ type: PublicConcertSummaryResponseDto, isArray: true })
  data: PublicConcertSummaryResponseDto[];

  @ApiProperty({ type: PublicConcertPaginationMetaDto })
  meta: PublicConcertPaginationMetaDto;
}
