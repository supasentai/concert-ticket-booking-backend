import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, HealthCheckResponse } from './app.service';

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database health' })
  async getHealth(): Promise<HealthCheckResponse> {
    return this.appService.getHealth();
  }
}
