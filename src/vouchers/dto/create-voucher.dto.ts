import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VoucherDiscountType } from '../../../generated/prisma/enums';

const optionalDecimal = (_object: unknown, value: unknown): boolean =>
  value !== undefined && value !== null;

export class CreateVoucherDto {
  @ApiProperty({ example: 'SUMMER20', maxLength: 64 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional({
    example: '20% discount for summer concerts.',
    maxLength: 1000,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({
    enum: VoucherDiscountType,
    example: VoucherDiscountType.PERCENTAGE,
  })
  @IsEnum(VoucherDiscountType)
  discountType: VoucherDiscountType;

  @ApiProperty({ example: '20.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  discountValue: string;

  @ApiPropertyOptional({ example: '100000.00', nullable: true })
  @ValidateIf(optionalDecimal)
  @IsDecimal({ decimal_digits: '0,2' })
  maximumDiscountAmount?: string | null;

  @ApiPropertyOptional({ example: '500000.00', nullable: true })
  @ValidateIf(optionalDecimal)
  @IsDecimal({ decimal_digits: '0,2' })
  minimumOrderAmount?: string | null;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2026-08-31T23:59:59.999Z' })
  @IsDateString()
  expiresAt: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 100, minimum: 1, nullable: true })
  @ValidateIf(
    (_object, value): boolean => value !== undefined && value !== null,
  )
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @ApiPropertyOptional({ example: 1, minimum: 1, nullable: true })
  @ValidateIf(
    (_object, value): boolean => value !== undefined && value !== null,
  )
  @IsInt()
  @Min(1)
  perUserUsageLimit?: number | null;
}
