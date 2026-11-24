import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/auth.decorators';
import { SkipThrottle } from '@nestjs/throttler';

@Public()
@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getStatus() {
    return { success: true, data: this.appService.getStatus(), message: 'OK' };
  }

  /** Liveness: the process is up. */
  @Get('health')
  getHealth() {
    return { success: true, data: this.appService.health(), message: 'OK' };
  }

  /** Readiness: dependencies reachable. Checks are added as each dependency (DB, cache, storage) lands. */
  @Get('health/ready')
  async getReadiness() {
    return { success: true, data: await this.appService.readiness(), message: 'OK' };
  }
}
