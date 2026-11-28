import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { NotificationError } from '../domain/notification.rules.js';
@Catch(NotificationError)
export class NotificationExceptionFilter implements ExceptionFilter {
  catch(error: NotificationError, host: ArgumentsHost) {
    const status = {
      forbidden: 403,
      not_found: 404,
      invalid_input: 400,
      unavailable: 503,
    }[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, code: error.code, message: error.code });
  }
}
