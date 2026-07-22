import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums';

export class UserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'customer@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Example Customer', nullable: true })
  fullName: string | null;

  @ApiProperty({ enum: Role, example: Role.CUSTOMER })
  role: Role;

  @ApiProperty({ example: '2026-07-22T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-22T00:00:00.000Z' })
  updatedAt: Date;
}
