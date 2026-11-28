import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { PracticumError } from '../domain/practicum.rules.js';

@Catch(PracticumError)
export class PracticumExceptionFilter implements ExceptionFilter {
  catch(error: PracticumError, host: ArgumentsHost) {
    const statuses = {
      forbidden: 403,
      not_found: 404,
      invalid_input: 400,
      inactive_placement: 409,
      invalid_period: 409,
      inactive_task: 409,
      timer_running: 409,
      overlap: 409,
      version_conflict: 409,
      duplicate: 409,
      unavailable: 503,
    };
    const response = host.switchToHttp().getResponse<Response>();
    const status = statuses[error.code];
    if (status === 503) response.setHeader('Retry-After', '1');
    response
      .status(status)
      .json({ statusCode: status, code: error.code, message: error.code });
  }
}
