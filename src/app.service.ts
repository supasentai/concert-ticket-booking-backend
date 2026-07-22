import { Injectable } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';

export interface HealthCheckResponse {
  status: 'ok';
  database: 'connected';
  timestamp: string;
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthCheckResponse> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
