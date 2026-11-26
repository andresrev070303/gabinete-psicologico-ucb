import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export function configureApplication(
  app: INestApplication,
  origins: readonly string[],
) {
  if (origins.length === 0)
    throw new Error('CORS_ORIGINS must contain at least one origin.');
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCsrfProtection({ trustedOrigins: [...origins] });
  app.enableCors({ origin: [...origins], credentials: true });
}
