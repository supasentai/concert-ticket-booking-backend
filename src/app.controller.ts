import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { HealthResponseDto } from './health-response.dto';

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database health' })
  @ApiResponse({
    status: 200,
    description: 'API is running and PostgreSQL is reachable.',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'PostgreSQL is not reachable.',
  })
  async getHealth(): Promise<HealthResponseDto> {
    return this.appService.getHealth();
  }
}
