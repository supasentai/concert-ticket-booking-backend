import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookingsService } from './bookings.service';
import { OperatorBookingQueryDto } from './dto/operator-booking-query.dto';
import {
  OperatorBookingResponseDto,
  PaginatedOperatorBookingResponseDto,
} from './dto/operator-booking-response.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

@ApiTags('Operator Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR)
@Controller('operator/bookings')
export class OperatorBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'List bookings for operation monitoring' })
  @ApiOkResponse({ type: PaginatedOperatorBookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameter.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  async findAll(
    @Query() query: OperatorBookingQueryDto,
  ): Promise<PaginatedOperatorBookingResponseDto> {
    return this.bookingsService.findAllForOperator(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking details for operation monitoring' })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: OperatorBookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid booking id.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OperatorBookingResponseDto> {
    return this.bookingsService.findOneForOperator(id);
  }

  @Patch(':id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Transition a pending booking status as an operator',
  })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: OperatorBookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid booking id or status.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiConflictResponse({
    description:
      'Same-state or illegal transition. Supported transitions are PENDING -> PAID and PENDING -> CANCELLED.',
  })
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBookingStatusDto,
  ): Promise<OperatorBookingResponseDto> {
    return this.bookingsService.updateStatusForOperator(id, dto.status);
  }
}
