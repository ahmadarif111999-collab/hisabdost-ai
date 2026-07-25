import {
  Controller,
  Get,
} from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root() {
    return this.status();
  }

  @Get('health')
  health() {
    return this.status();
  }

  private status() {
    return {
      ok: true,
      service:
        'hisabdost-api',
      message:
        'HisabDost API is running',
      timestamp:
        new Date().toISOString(),
    };
  }
}
