// Load backend/api/.env when present (real environments set variables directly).
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { env } from './config/env';
import { API_PREFIX, buildOpenApiDocument } from './openapi/document';

async function bootstrap() {
  const e = env(); // fails fast on bad configuration
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);

  if (e.SWAGGER_ENABLED) {
    SwaggerModule.setup('api/docs', app, buildOpenApiDocument(), {
      jsonDocumentUrl: 'api/docs/openapi.json',
      yamlDocumentUrl: 'api/docs/openapi.yaml',
      customSiteTitle: 'Grooveli City API',
      swaggerOptions: { withCredentials: true, docExpansion: 'none', filter: true, displayOperationId: true },
    });
  }

  await app.listen(e.PORT, '0.0.0.0');
  console.log(`Grooveli API on http://localhost:${e.PORT}/${API_PREFIX}${e.SWAGGER_ENABLED ? ' — docs at /api/docs' : ''}`);
}

bootstrap();
