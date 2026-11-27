import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { IdentityOperationError } from '../application/account-management.contracts.js';
import { AuthenticationFailure } from '../application/authentication.contracts.js';

@Catch(IdentityOperationError, AuthenticationFailure)
export class IdentityExceptionFilter implements ExceptionFilter {
  catch(
    error: IdentityOperationError | AuthenticationFailure,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<Response>();
    const statuses = {
      forbidden: 403,
      not_found: 404,
      email_conflict: 409,
      invalid_candidate: 409,
      invalid_activation: 400,
      invalid_state: 409,
      invalid_password: 400,
      rate_limited: 429,
      reauthentication_required: 403,
      unavailable: 503,
    };
    const status =
      error instanceof IdentityOperationError ? statuses[error.kind] : 503;
    if (status === 503) response.setHeader('Retry-After', '1');
    if (status === 429) response.setHeader('Retry-After', '900');
    response
      .status(status)
      .json({ statusCode: status, code: error.kind, message: error.message });
  }
}
