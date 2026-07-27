import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @Public()
  @Get('metrics')
  @ApiExcludeEndpoint()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.metrics());
  }

  @Get('admin/system-health')
  @Roles(Role.ADMIN)
  @ApiTags('admin')
  @ApiOperation({ summary: 'JSON summary of process/request metrics (admin)' })
  summary() {
    return this.metrics.summary();
  }
}
