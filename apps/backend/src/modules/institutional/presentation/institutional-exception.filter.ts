import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InstitutionalError } from '../domain/institutional.rules.js';
@Catch(InstitutionalError)
export class InstitutionalExceptionFilter implements ExceptionFilter {
  catch(error: InstitutionalError, host: ArgumentsHost) {
    const statuses = {
      forbidden: 403,
      not_found: 404,
      invalid_input: 400,
      invalid_period: 400,
      invalid_transition: 409,
      invalid_reference: 409,
      version_conflict: 409,
      duplicate: 409,
      linked_records: 409,
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
