import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class MockPaymentDto {
  @ApiProperty({
    description: 'Use true to mark payment as paid, false to fail and cancel.',
    example: true,
  })
  @IsBoolean()
  success: boolean;
}
