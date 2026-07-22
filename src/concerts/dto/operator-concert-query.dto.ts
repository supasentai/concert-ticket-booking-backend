import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ConcertStatus } from '../../../generated/prisma/enums';
import { ConcertQueryDto } from './concert-query.dto';

class OperatorConcertStatusFilterDto {
  @ApiPropertyOptional({ enum: ConcertStatus, example: ConcertStatus.DRAFT })
  @IsOptional()
  @IsEnum(ConcertStatus)
  status?: ConcertStatus;
}

export class OperatorConcertQueryDto extends IntersectionType(
  ConcertQueryDto,
  OperatorConcertStatusFilterDto,
) {}
