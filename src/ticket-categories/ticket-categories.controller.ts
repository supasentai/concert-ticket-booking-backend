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
import { TicketCategoryResponseDto } from '../concerts/dto/concert-response.dto';
import { CreateTicketCategoryDto } from './dto/create-ticket-category.dto';
import { UpdateTicketCategoryDto } from './dto/update-ticket-category.dto';
import { TicketCategoriesService } from './ticket-categories.service';

@ApiTags('Ticket Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR)
@Controller('operator/concerts/:concertId/ticket-categories')
export class TicketCategoriesController {
  constructor(
    private readonly ticketCategoriesService: TicketCategoriesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a ticket category for a draft concert' })
  @ApiParam({ name: 'concertId', description: 'Concert id' })
  @ApiCreatedResponse({ type: TicketCategoryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid ticket category data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert not found.' })
  @ApiConflictResponse({
    description:
      'Concert is not draft or category name already exists for this concert.',
  })
  async create(
    @Param('concertId') concertId: string,
    @Body() createTicketCategoryDto: CreateTicketCategoryDto,
  ): Promise<TicketCategoryResponseDto> {
    return this.ticketCategoriesService.create(
      concertId,
      createTicketCategoryDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List ticket categories for a concert' })
  @ApiParam({ name: 'concertId', description: 'Concert id' })
  @ApiOkResponse({ type: TicketCategoryResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert not found.' })
  async findAll(
    @Param('concertId') concertId: string,
  ): Promise<TicketCategoryResponseDto[]> {
    return this.ticketCategoriesService.findAll(concertId);
  }

  @Get(':categoryId')
  @ApiOperation({ summary: 'Get a ticket category for a concert' })
  @ApiParam({ name: 'concertId', description: 'Concert id' })
  @ApiParam({ name: 'categoryId', description: 'Ticket category id' })
  @ApiOkResponse({ type: TicketCategoryResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert or ticket category not found.' })
  async findOne(
    @Param('concertId') concertId: string,
    @Param('categoryId') categoryId: string,
  ): Promise<TicketCategoryResponseDto> {
    return this.ticketCategoriesService.findOne(concertId, categoryId);
  }

  @Patch(':categoryId')
  @ApiOperation({ summary: 'Update a ticket category for a draft concert' })
  @ApiParam({ name: 'concertId', description: 'Concert id' })
  @ApiParam({ name: 'categoryId', description: 'Ticket category id' })
  @ApiOkResponse({ type: TicketCategoryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid ticket category data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert or ticket category not found.' })
  @ApiConflictResponse({
    description:
      'Concert is not draft, category name already exists, or quantity is below sold count.',
  })
  async update(
    @Param('concertId') concertId: string,
    @Param('categoryId') categoryId: string,
    @Body() updateTicketCategoryDto: UpdateTicketCategoryDto,
  ): Promise<TicketCategoryResponseDto> {
    return this.ticketCategoriesService.update(
      concertId,
      categoryId,
      updateTicketCategoryDto,
    );
  }

  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a ticket category from a draft concert' })
  @ApiParam({ name: 'concertId', description: 'Concert id' })
  @ApiParam({ name: 'categoryId', description: 'Ticket category id' })
  @ApiNoContentResponse({ description: 'Ticket category deleted.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Operator role is required.' })
  @ApiNotFoundResponse({ description: 'Concert or ticket category not found.' })
  @ApiConflictResponse({
    description: 'Only draft concerts may modify ticket categories.',
  })
  async remove(
    @Param('concertId') concertId: string,
    @Param('categoryId') categoryId: string,
  ): Promise<void> {
    await this.ticketCategoriesService.remove(concertId, categoryId);
  }
}
