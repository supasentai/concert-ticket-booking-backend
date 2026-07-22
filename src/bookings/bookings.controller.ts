import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BookingsService } from './bookings.service';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MockPaymentDto } from './dto/mock-payment.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a pending booking and reserve tickets' })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid booking request.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Customer role is required.' })
  @ApiNotFoundResponse({ description: 'Concert or ticket category not found.' })
  @ApiConflictResponse({
    description:
      'Concert/category is not bookable or not enough tickets remain.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createBookingDto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.create(user, createBookingDto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List current customer bookings' })
  @ApiOkResponse({ type: BookingResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Customer role is required.' })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto[]> {
    return this.bookingsService.findMine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get current customer booking details' })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({
    description:
      'Customer role is required or booking belongs to another user.',
  })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.findOne(user, id);
  }

  @Post(':id/pay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mock payment for a pending booking' })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payment request.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({
    description:
      'Customer role is required or booking belongs to another user.',
  })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiConflictResponse({
    description: 'Only pending bookings may be paid.',
  })
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() mockPaymentDto: MockPaymentDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.pay(user, id, mockPaymentDto.success);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a pending booking and restore tickets' })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({
    description:
      'Customer role is required or booking belongs to another user.',
  })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiConflictResponse({
    description: 'Only pending bookings may be cancelled.',
  })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.cancel(user, id);
  }
}
