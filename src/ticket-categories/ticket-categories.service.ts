import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConcertStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TicketCategoryResponseDto } from '../concerts/dto/concert-response.dto';
import { CreateTicketCategoryDto } from './dto/create-ticket-category.dto';
import { UpdateTicketCategoryDto } from './dto/update-ticket-category.dto';

type ParentConcert = {
  id: string;
  status: ConcertStatus;
};

type TicketCategoryEntity = Prisma.TicketCategoryGetPayload<
  Record<string, never>
>;

@Injectable()
export class TicketCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    concertId: string,
    dto: CreateTicketCategoryDto,
  ): Promise<TicketCategoryResponseDto> {
    const concert = await this.findConcertOrThrow(concertId);
    this.assertDraftConcert(concert, 'modify ticket categories');
    await this.assertNameAvailable(concertId, dto.name);

    try {
      const category = await this.prisma.ticketCategory.create({
        data: {
          concertId,
          name: dto.name,
          description: dto.description ?? null,
          price: dto.price,
          quantity: dto.quantity,
          sold: 0,
          isActive: dto.isActive ?? true,
        },
      });

      return this.toResponse(category);
    } catch (error) {
      this.mapUniqueConstraintError(error);
      throw error;
    }
  }

  async findAll(concertId: string): Promise<TicketCategoryResponseDto[]> {
    await this.findConcertOrThrow(concertId);

    const categories = await this.prisma.ticketCategory.findMany({
      where: { concertId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return categories.map((category) => this.toResponse(category));
  }

  async findOne(
    concertId: string,
    categoryId: string,
  ): Promise<TicketCategoryResponseDto> {
    await this.findConcertOrThrow(concertId);
    const category = await this.findCategoryOrThrow(concertId, categoryId);

    return this.toResponse(category);
  }

  async update(
    concertId: string,
    categoryId: string,
    dto: UpdateTicketCategoryDto,
  ): Promise<TicketCategoryResponseDto> {
    const concert = await this.findConcertOrThrow(concertId);
    this.assertDraftConcert(concert, 'modify ticket categories');
    const existing = await this.findCategoryOrThrow(concertId, categoryId);

    if (dto.quantity !== undefined && dto.quantity < existing.sold) {
      throw new ConflictException('Quantity cannot be lower than sold count');
    }

    if (dto.name !== undefined && dto.name !== existing.name) {
      await this.assertNameAvailable(concertId, dto.name);
    }

    try {
      const category = await this.prisma.ticketCategory.update({
        where: { id: categoryId },
        data: this.buildUpdateData(dto),
      });

      return this.toResponse(category);
    } catch (error) {
      this.mapUniqueConstraintError(error);
      throw error;
    }
  }

  async remove(concertId: string, categoryId: string): Promise<void> {
    const concert = await this.findConcertOrThrow(concertId);
    this.assertDraftConcert(concert, 'modify ticket categories');
    await this.findCategoryOrThrow(concertId, categoryId);

    await this.prisma.ticketCategory.delete({
      where: { id: categoryId },
    });
  }

  private async findConcertOrThrow(concertId: string): Promise<ParentConcert> {
    const concert = await this.prisma.concert.findUnique({
      where: { id: concertId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!concert) {
      throw new NotFoundException('Concert not found');
    }

    return concert;
  }

  private assertDraftConcert(concert: ParentConcert, action: string): void {
    if (concert.status !== ConcertStatus.DRAFT) {
      throw new ConflictException(`Only draft concerts may ${action}`);
    }
  }

  private async findCategoryOrThrow(
    concertId: string,
    categoryId: string,
  ): Promise<TicketCategoryEntity> {
    const category = await this.prisma.ticketCategory.findFirst({
      where: {
        id: categoryId,
        concertId,
      },
    });

    if (!category) {
      throw new NotFoundException('Ticket category not found');
    }

    return category;
  }

  private async assertNameAvailable(
    concertId: string,
    name: string,
  ): Promise<void> {
    const existing = await this.prisma.ticketCategory.findFirst({
      where: {
        concertId,
        name,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Ticket category name already exists for this concert',
      );
    }
  }

  private buildUpdateData(
    dto: UpdateTicketCategoryDto,
  ): Prisma.TicketCategoryUpdateInput {
    const data: Prisma.TicketCategoryUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return data;
  }

  private mapUniqueConstraintError(error: unknown): void {
    if (this.isPrismaUniqueConstraintError(error)) {
      throw new ConflictException(
        'Ticket category name already exists for this concert',
      );
    }
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private toResponse(
    category: TicketCategoryEntity,
  ): TicketCategoryResponseDto {
    return {
      id: category.id,
      concertId: category.concertId,
      name: category.name,
      description: category.description,
      price: category.price.toString(),
      quantity: category.quantity,
      sold: category.sold,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
