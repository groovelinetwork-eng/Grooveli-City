import { Injectable } from '@nestjs/common';
import { APP_NAME } from '@grooveli/shared';

@Injectable()
export class AppService {
  getStatus() {
    return {
      name: APP_NAME,
      version: '0.1.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  }
}

