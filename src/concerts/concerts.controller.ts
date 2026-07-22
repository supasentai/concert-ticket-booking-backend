import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConcertsService } from './concerts.service';
import {
  ConcertResponseDto,
  PaginatedConcertResponseDto,
} from './dto/concert-response.dto';
import { CreateConcertDto } from './dto/create-concert.dto';
import { OperatorConcertQueryDto } from './dto/operator-concert-query.dto';
import { UpdateConcertDto } from './dto/update-concert.dto';

@ApiTags('Concerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR)
@Controller('operator/concerts')
export class ConcertsController {
  constructor(private readonly concertsService: ConcertsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft concert as an operator' })
  @ApiCreatedResponse({ type: ConcertResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid concert data or time range.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  async create(
    @Body() createConcertDto: CreateConcertDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConcertResponseDto> {
    return this.concertsService.create(createConcertDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List concerts as an operator' })
  @ApiOkResponse({ type: PaginatedConcertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  async findAll(
    @Query() query: OperatorConcertQueryDto,
  ): Promise<PaginatedConcertResponseDto> {
    return this.concertsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get operator concert details' })
  @ApiParam({ name: 'id', description: 'Concert id' })
  @ApiOkResponse({ type: ConcertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert not found.' })
  async findOne(@Param('id') id: string): Promise<ConcertResponseDto> {
    return this.concertsService.findOne(id);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish a draft concert as an operator' })
  @ApiParam({ name: 'id', description: 'Concert id' })
  @ApiOkResponse({ type: ConcertResponseDto })
  @ApiBadRequestResponse({
    description: 'Concert does not meet publish prerequisites.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert not found.' })
  @ApiConflictResponse({
    description:
      'Concert is not draft or was changed by another request before publishing.',
  })
  async publish(@Param('id') id: string): Promise<ConcertResponseDto> {
    return this.concertsService.publish(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft concert as an operator' })
  @ApiParam({ name: 'id', description: 'Concert id' })
  @ApiOkResponse({ type: ConcertResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid concert data or time range.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert not found.' })
  @ApiConflictResponse({
    description: 'Only draft concerts may be updated.',
  })
  async update(
    @Param('id') id: string,
    @Body() updateConcertDto: UpdateConcertDto,
  ): Promise<ConcertResponseDto> {
    return this.concertsService.update(id, updateConcertDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft concert as an operator' })
  @ApiParam({ name: 'id', description: 'Concert id' })
  @ApiNoContentResponse({ description: 'Concert deleted.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert not found.' })
  @ApiConflictResponse({
    description: 'Only draft concerts may be deleted.',
  })
  async remove(@Param('id') id: string): Promise<void> {
    await this.concertsService.remove(id);
  }
}
