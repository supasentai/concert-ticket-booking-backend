import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { VoucherValidationResponseDto } from './dto/voucher-validation-response.dto';
import { VouchersService } from './vouchers.service';

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('vouchers')
export class VoucherValidationController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Preview a voucher discount without mutating usage or inventory',
  })
  @ApiOkResponse({ type: VoucherValidationResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid request, voucher configuration, or minimum order.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Customer role is required.' })
  @ApiNotFoundResponse({
    description: 'Voucher, concert, or ticket category not found.',
  })
  @ApiConflictResponse({
    description:
      'Voucher is inactive, not started, expired, exhausted, or category is unavailable.',
  })
  async validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() validateVoucherDto: ValidateVoucherDto,
  ): Promise<VoucherValidationResponseDto> {
    return this.vouchersService.validate(user, validateVoucherDto);
  }
}
