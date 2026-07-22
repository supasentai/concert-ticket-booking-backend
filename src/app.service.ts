import { Injectable } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';
import { HealthResponseDto } from './health-response.dto';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthResponseDto> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
