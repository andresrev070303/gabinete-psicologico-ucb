import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const allowedOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin.');
  }

  app.enableCors({ origin: allowedOrigins });
  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT', '3000'));
  await app.listen(port, '0.0.0.0');
}

await bootstrap();