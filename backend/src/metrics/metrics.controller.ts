import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../common/decorators';
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
}
