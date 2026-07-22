import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ConcertsService } from './concerts.service';
import { ConcertQueryDto } from './dto/concert-query.dto';
import {
  PaginatedPublicConcertResponseDto,
  PublicConcertDetailResponseDto,
} from './dto/public-concert-response.dto';

@ApiTags('Concerts')
@Controller('concerts')
export class ConcertsPublicController {
  constructor(private readonly concertsService: ConcertsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse published concerts' })
  @ApiOkResponse({ type: PaginatedPublicConcertResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  async findPublicAll(
    @Query() query: ConcertQueryDto,
  ): Promise<PaginatedPublicConcertResponseDto> {
    return this.concertsService.findPublicAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public concert details' })
  @ApiParam({ name: 'id', description: 'Concert id' })
  @ApiOkResponse({ type: PublicConcertDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Concert not found.' })
  async findPublicOne(
    @Param('id') id: string,
  ): Promise<PublicConcertDetailResponseDto> {
    return this.concertsService.findPublicOne(id);
  }
}
