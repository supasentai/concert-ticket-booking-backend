import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { VoucherQueryDto } from './dto/voucher-query.dto';
import {
  PaginatedVoucherResponseDto,
  VoucherResponseDto,
} from './dto/voucher-response.dto';
import { VouchersService } from './vouchers.service';

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a voucher as an operator' })
  @ApiCreatedResponse({ type: VoucherResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid voucher configuration.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiConflictResponse({ description: 'Voucher code already exists.' })
  async create(
    @Body() createVoucherDto: CreateVoucherDto,
  ): Promise<VoucherResponseDto> {
    return this.vouchersService.create(createVoucherDto);
  }

  @Get()
  @ApiOperation({ summary: 'List vouchers as an operator' })
  @ApiOkResponse({ type: PaginatedVoucherResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  async findAll(
    @Query() query: VoucherQueryDto,
  ): Promise<PaginatedVoucherResponseDto> {
    return this.vouchersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get voucher details as an operator' })
  @ApiParam({ name: 'id', description: 'Voucher id' })
  @ApiOkResponse({ type: VoucherResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid voucher id.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Voucher not found.' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VoucherResponseDto> {
    return this.vouchersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update voucher details as an operator' })
  @ApiParam({ name: 'id', description: 'Voucher id' })
  @ApiOkResponse({ type: VoucherResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid voucher configuration.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Voucher not found.' })
  @ApiConflictResponse({
    description: 'Voucher code already exists or usage limits conflict.',
  })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateVoucherDto: UpdateVoucherDto,
  ): Promise<VoucherResponseDto> {
    return this.vouchersService.update(id, updateVoucherDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused voucher as an operator' })
  @ApiParam({ name: 'id', description: 'Voucher id' })
  @ApiNoContentResponse({ description: 'Voucher deleted.' })
  @ApiBadRequestResponse({ description: 'Invalid voucher id.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Voucher not found.' })
  @ApiConflictResponse({
    description: 'Voucher with usage history cannot be deleted.',
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.vouchersService.remove(id);
  }
}
