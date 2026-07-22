import { ApiProperty } from '@nestjs/swagger';

export class DashboardSummaryResponseDto {
  @ApiProperty({ example: 12 })
  totalConcerts: number;

  @ApiProperty({ example: 8 })
  publishedConcerts: number;

  @ApiProperty({ example: 4 })
  draftConcerts: number;

  @ApiProperty({ example: 100 })
  totalBookings: number;

  @ApiProperty({ example: 12 })
  pendingBookings: number;

  @ApiProperty({ example: 80 })
  paidBookings: number;

  @ApiProperty({ example: 8 })
  cancelledBookings: number;

  @ApiProperty({ example: '12500000' })
  grossRevenue: string;

  @ApiProperty({ example: 150 })
  ticketsSold: number;

  @ApiProperty({ example: 6 })
  activeVouchers: number;
}
