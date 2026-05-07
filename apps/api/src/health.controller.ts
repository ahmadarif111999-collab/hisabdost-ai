import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { ok: true, service: 'pakbooks-api', timestamp: new Date().toISOString() };
  }
}
