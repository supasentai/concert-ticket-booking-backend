import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BookingStatus } from '../../../generated/prisma/enums';

export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: BookingStatus,
    example: BookingStatus.CANCELLED,
    description:
      'Supported operator transitions: PENDING -> PAID and PENDING -> CANCELLED.',
  })
  @IsEnum(BookingStatus)
  status: BookingStatus;
}
