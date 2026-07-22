import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateConcertDto {
  @ApiProperty({
    example: 'Summer Lights Festival',
    minLength: 3,
    maxLength: 200,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: 'An outdoor evening concert.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 'City Arena', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  venue: string;

  @ApiPropertyOptional({ example: '123 Main Street', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ example: '2026-08-01T19:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-08-01T22:00:00.000Z' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  saleStartAt?: string;

  @ApiPropertyOptional({ example: '2026-08-01T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  saleEndAt?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/posters/summer-lights.jpg',
  })
  @IsOptional()
  @IsUrl()
  posterUrl?: string;
}
