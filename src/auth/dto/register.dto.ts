import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'customer@example.com' })
  @Transform(({ value }: TransformFnParams): unknown => {
    const rawValue = value as unknown;

    return typeof rawValue === 'string'
      ? rawValue.trim().toLowerCase()
      : rawValue;
  })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain at least one lowercase letter, one uppercase letter, and one digit',
  })
  password: string;

  @ApiPropertyOptional({ example: 'Example Customer' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: TransformFnParams): unknown => {
    const rawValue = value as unknown;

    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  fullName?: string;
}
