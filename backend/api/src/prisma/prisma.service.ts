import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppService } from '../app.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly app: AppService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.app.registerReadinessCheck('database', async () => {
      await this.$queryRaw`SELECT 1`;
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [AppService, PrismaService], exports: [AppService, PrismaService] })
export class PrismaModule {}
