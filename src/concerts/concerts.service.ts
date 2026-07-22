import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConcertStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConcertQueryDto } from './dto/concert-query.dto';
import {
  ConcertResponseDto,
  PaginatedConcertResponseDto,
} from './dto/concert-response.dto';
import { CreateConcertDto } from './dto/create-concert.dto';
import { OperatorConcertQueryDto } from './dto/operator-concert-query.dto';
import {
  PaginatedPublicConcertResponseDto,
  PublicConcertDetailResponseDto,
  PublicConcertSummaryResponseDto,
} from './dto/public-concert-response.dto';
import { UpdateConcertDto } from './dto/update-concert.dto';

type ConcertWithDetails = Prisma.ConcertGetPayload<{
  include: typeof CONCERT_DETAIL_INCLUDE;
}>;

type ConcertListItem = Prisma.ConcertGetPayload<{
  include: typeof CONCERT_LIST_INCLUDE;
}>;

type PublicConcertListItem = Prisma.ConcertGetPayload<{
  select: typeof PUBLIC_CONCERT_LIST_SELECT;
}>;

type PublicConcertDetailItem = Prisma.ConcertGetPayload<{
  select: typeof PUBLIC_CONCERT_DETAIL_SELECT;
}>;

type ConcertDateValues = {
  startTime: Date;
  endTime: Date;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
};

type ConcertWritableValues = ConcertDateValues & {
  title: string;
  description?: string | null;
  venue: string;
  address?: string | null;
  posterUrl?: string | null;
};

const CONCERT_LIST_INCLUDE = {
  createdBy: {
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  },
} satisfies Prisma.ConcertInclude;

const CONCERT_DETAIL_INCLUDE = {
  ...CONCERT_LIST_INCLUDE,
  ticketCategories: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ConcertInclude;

const PUBLIC_CONCERT_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  venue: true,
  address: true,
  startTime: true,
  endTime: true,
  saleStartAt: true,
  saleEndAt: true,
  posterUrl: true,
  publishedAt: true,
} satisfies Prisma.ConcertSelect;

const PUBLIC_CONCERT_DETAIL_SELECT = {
  ...PUBLIC_CONCERT_LIST_SELECT,
  ticketCategories: {
    where: {
      isActive: true,
    },
    orderBy: [{ price: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
    },
  },
} satisfies Prisma.ConcertSelect;

@Injectable()
export class ConcertsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateConcertDto,
    operator: AuthenticatedUser,
  ): Promise<ConcertResponseDto> {
    const values = this.buildCreateValues(dto);
    this.validateDateRules(values);

    const concert = await this.prisma.concert.create({
      data: {
        ...values,
        createdById: operator.id,
        status: ConcertStatus.DRAFT,
        publishedAt: null,
      },
      include: CONCERT_LIST_INCLUDE,
    });

    return this.toConcertResponse(concert);
  }

  async findAll(
    query: OperatorConcertQueryDto,
  ): Promise<PaginatedConcertResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [concerts, total] = await this.prisma.$transaction([
      this.prisma.concert.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        include: CONCERT_LIST_INCLUDE,
      }),
      this.prisma.concert.count({ where }),
    ]);

    return {
      data: concerts.map((concert) => this.toConcertResponse(concert)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicAll(
    query: ConcertQueryDto,
  ): Promise<PaginatedPublicConcertResponseDto> {
    const now = new Date();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildPublicWhere(query, now);
    const sortBy = query.sortBy ?? 'startTime';
    const sortOrder = query.sortOrder ?? 'asc';

    const [concerts, total] = await this.prisma.$transaction([
      this.prisma.concert.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        select: PUBLIC_CONCERT_LIST_SELECT,
      }),
      this.prisma.concert.count({ where }),
    ]);

    return {
      data: concerts.map((concert) => this.toPublicSummaryResponse(concert)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicOne(id: string): Promise<PublicConcertDetailResponseDto> {
    const now = new Date();
    const concert = await this.prisma.concert.findFirst({
      where: {
        id,
        status: ConcertStatus.PUBLISHED,
        endTime: {
          gt: now,
        },
      },
      select: PUBLIC_CONCERT_DETAIL_SELECT,
    });

    if (!concert) {
      throw new NotFoundException('Concert not found');
    }

    return this.toPublicDetailResponse(concert);
  }

  async findOne(id: string): Promise<ConcertResponseDto> {
    const concert = await this.findConcertOrThrow(id, true);

    return this.toConcertResponse(concert);
  }

  async update(id: string, dto: UpdateConcertDto): Promise<ConcertResponseDto> {
    const existing = await this.findConcertOrThrow(id, false);

    if (existing.status !== ConcertStatus.DRAFT) {
      throw new ConflictException('Only draft concerts may be updated');
    }

    const values = this.buildUpdateValues(existing, dto);
    this.validateDateRules(values);

    const concert = await this.prisma.concert.update({
      where: { id },
      data: this.buildUpdateData(dto, values),
      include: CONCERT_LIST_INCLUDE,
    });

    return this.toConcertResponse(concert);
  }

  async publish(id: string): Promise<ConcertResponseDto> {
    const concert = await this.findConcertOrThrow(id, true);

    this.validatePublishEligibility(concert);

    const result = await this.prisma.concert.updateMany({
      where: {
        id,
        status: ConcertStatus.DRAFT,
      },
      data: {
        status: ConcertStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new ConflictException('Concert could not be published');
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const concert = await this.findConcertOrThrow(id, false);

    if (concert.status !== ConcertStatus.DRAFT) {
      throw new ConflictException('Only draft concerts may be deleted');
    }

    await this.prisma.concert.delete({
      where: { id },
    });
  }

  private buildWhere(query: OperatorConcertQueryDto): Prisma.ConcertWhereInput {
    const where: Prisma.ConcertWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { venue: { contains: query.search, mode: 'insensitive' } },
        { address: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const range = this.buildDateRange(query);

    if (range) {
      where.startTime = range;
    }

    return where;
  }

  private buildPublicWhere(
    query: ConcertQueryDto,
    now: Date,
  ): Prisma.ConcertWhereInput {
    const where: Prisma.ConcertWhereInput = {
      status: ConcertStatus.PUBLISHED,
      endTime: {
        gt: now,
      },
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { venue: { contains: query.search, mode: 'insensitive' } },
        { address: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const range = this.buildDateRange(query);

    if (range) {
      where.startTime = range;
    }

    return where;
  }

  private buildDateRange(
    query: Pick<ConcertQueryDto, 'from' | 'to'>,
  ): Prisma.DateTimeFilter<'Concert'> | undefined {
    const range: Prisma.DateTimeFilter<'Concert'> = {};

    if (query.from) {
      range.gte = this.parseDate(query.from, 'from');
    }

    if (query.to) {
      range.lte = this.parseDate(query.to, 'to');
    }

    if (Object.keys(range).length === 0) {
      return undefined;
    }

    return range;
  }

  private async findConcertOrThrow(
    id: string,
    includeDetails: true,
  ): Promise<ConcertWithDetails>;
  private async findConcertOrThrow(
    id: string,
    includeDetails: false,
  ): Promise<ConcertListItem>;
  private async findConcertOrThrow(
    id: string,
    includeDetails: boolean,
  ): Promise<ConcertWithDetails | ConcertListItem> {
    const concert = await this.prisma.concert.findUnique({
      where: { id },
      include: includeDetails ? CONCERT_DETAIL_INCLUDE : CONCERT_LIST_INCLUDE,
    });

    if (!concert) {
      throw new NotFoundException('Concert not found');
    }

    return concert;
  }

  private buildCreateValues(dto: CreateConcertDto): ConcertWritableValues {
    return {
      title: dto.title,
      description: dto.description ?? null,
      venue: dto.venue,
      address: dto.address ?? null,
      startTime: this.parseDate(dto.startTime, 'startTime'),
      endTime: this.parseDate(dto.endTime, 'endTime'),
      saleStartAt: dto.saleStartAt
        ? this.parseDate(dto.saleStartAt, 'saleStartAt')
        : null,
      saleEndAt: dto.saleEndAt
        ? this.parseDate(dto.saleEndAt, 'saleEndAt')
        : null,
      posterUrl: dto.posterUrl ?? null,
    };
  }

  private buildUpdateValues(
    existing: ConcertListItem,
    dto: UpdateConcertDto,
  ): ConcertWritableValues {
    return {
      title: dto.title ?? existing.title,
      description:
        dto.description === undefined ? existing.description : dto.description,
      venue: dto.venue ?? existing.venue,
      address: dto.address === undefined ? existing.address : dto.address,
      startTime: dto.startTime
        ? this.parseDate(dto.startTime, 'startTime')
        : existing.startTime,
      endTime: dto.endTime
        ? this.parseDate(dto.endTime, 'endTime')
        : existing.endTime,
      saleStartAt:
        dto.saleStartAt === undefined
          ? existing.saleStartAt
          : this.parseNullableDate(dto.saleStartAt, 'saleStartAt'),
      saleEndAt:
        dto.saleEndAt === undefined
          ? existing.saleEndAt
          : this.parseNullableDate(dto.saleEndAt, 'saleEndAt'),
      posterUrl:
        dto.posterUrl === undefined ? existing.posterUrl : dto.posterUrl,
    };
  }

  private buildUpdateData(
    dto: UpdateConcertDto,
    values: ConcertWritableValues,
  ): Prisma.ConcertUpdateInput {
    const data: Prisma.ConcertUpdateInput = {};

    if (dto.title !== undefined) data.title = values.title;
    if (dto.description !== undefined) data.description = values.description;
    if (dto.venue !== undefined) data.venue = values.venue;
    if (dto.address !== undefined) data.address = values.address;
    if (dto.startTime !== undefined) data.startTime = values.startTime;
    if (dto.endTime !== undefined) data.endTime = values.endTime;
    if (dto.saleStartAt !== undefined) data.saleStartAt = values.saleStartAt;
    if (dto.saleEndAt !== undefined) data.saleEndAt = values.saleEndAt;
    if (dto.posterUrl !== undefined) data.posterUrl = values.posterUrl;

    return data;
  }

  private validateDateRules(values: ConcertDateValues): void {
    if (values.startTime >= values.endTime) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }

    if (values.saleStartAt && values.saleEndAt) {
      if (values.saleStartAt >= values.saleEndAt) {
        throw new BadRequestException(
          'saleStartAt must be earlier than saleEndAt',
        );
      }
    }

    if (values.saleEndAt && values.saleEndAt > values.startTime) {
      throw new BadRequestException(
        'saleEndAt must not be later than startTime',
      );
    }
  }

  private validatePublishEligibility(concert: ConcertWithDetails): void {
    if (concert.status !== ConcertStatus.DRAFT) {
      throw new ConflictException('Only draft concerts may be published');
    }

    this.validateDateRules({
      startTime: concert.startTime,
      endTime: concert.endTime,
      saleStartAt: concert.saleStartAt,
      saleEndAt: concert.saleEndAt,
    });

    if (concert.startTime <= new Date()) {
      throw new BadRequestException('startTime must be in the future');
    }

    if (concert.ticketCategories.length === 0) {
      throw new BadRequestException(
        'Concert must have at least one ticket category',
      );
    }

    const activeCategories = concert.ticketCategories.filter(
      (category) => category.isActive,
    );

    if (activeCategories.length === 0) {
      throw new BadRequestException(
        'Concert must have at least one active ticket category',
      );
    }

    for (const category of activeCategories) {
      const price = Number(category.price.toString());

      if (price < 0) {
        throw new BadRequestException(
          'Active ticket category price must be greater than or equal to 0',
        );
      }

      if (category.quantity < 1) {
        throw new BadRequestException(
          'Active ticket category quantity must be at least 1',
        );
      }

      if (category.sold < 0) {
        throw new BadRequestException(
          'Active ticket category sold count must be greater than or equal to 0',
        );
      }

      if (category.sold > category.quantity) {
        throw new BadRequestException(
          'Active ticket category sold count cannot exceed quantity',
        );
      }
    }
  }

  private parseNullableDate(
    value: string | undefined,
    field: string,
  ): Date | null {
    return value ? this.parseDate(value, field) : null;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO datetime`);
    }

    return date;
  }

  private toConcertResponse(
    concert: ConcertListItem | ConcertWithDetails,
  ): ConcertResponseDto {
    return {
      id: concert.id,
      title: concert.title,
      description: concert.description,
      venue: concert.venue,
      address: concert.address,
      startTime: concert.startTime,
      endTime: concert.endTime,
      saleStartAt: concert.saleStartAt,
      saleEndAt: concert.saleEndAt,
      posterUrl: concert.posterUrl,
      status: concert.status,
      publishedAt: concert.publishedAt,
      createdById: concert.createdById,
      createdBy: concert.createdBy,
      ticketCategories:
        'ticketCategories' in concert
          ? concert.ticketCategories.map((category) => ({
              ...category,
              price: category.price.toString(),
            }))
          : undefined,
      createdAt: concert.createdAt,
      updatedAt: concert.updatedAt,
    };
  }

  private toPublicSummaryResponse(
    concert: PublicConcertListItem,
  ): PublicConcertSummaryResponseDto {
    return {
      id: concert.id,
      title: concert.title,
      description: concert.description,
      venue: concert.venue,
      address: concert.address,
      startTime: concert.startTime,
      endTime: concert.endTime,
      saleStartAt: concert.saleStartAt,
      saleEndAt: concert.saleEndAt,
      posterUrl: concert.posterUrl,
      publishedAt: concert.publishedAt,
    };
  }

  private toPublicDetailResponse(
    concert: PublicConcertDetailItem,
  ): PublicConcertDetailResponseDto {
    return {
      ...this.toPublicSummaryResponse(concert),
      ticketCategories: concert.ticketCategories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        price: category.price.toString(),
      })),
    };
  }
}
