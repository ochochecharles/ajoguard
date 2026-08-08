import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // GET /health — liveness + readiness probe (no auth, used by load balancers)
  @ApiOperation({ summary: 'Health check (liveness/readiness)' })
  @Get()
  async check() {
    await this.healthService.check();
    return this.healthService.getStatus();
  }

  // GET /health/ready — readiness probe (verifies DB connection)
  @ApiOperation({ summary: 'Readiness check (verifies database connectivity)' })
  @Get('ready')
  async ready() {
    const ok = await this.healthService.dbOk();
    if (!ok) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return this.healthService.getStatus();
  }
}
