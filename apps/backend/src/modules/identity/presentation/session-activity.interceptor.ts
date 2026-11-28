import { Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { AuthenticationContext } from '@nestjs/authentication';
import type { Request } from 'express';
import { mergeMap } from 'rxjs';
import type {
  PublicIdentity,
  PublicSession,
} from '../application/authentication.contracts.js';
import { AuthenticationService } from '../application/authentication.service.js';
import { requestId } from './session-cookie.js';

@Injectable()
export class SessionActivityInterceptor implements NestInterceptor {
  constructor(
    private readonly context: AuthenticationContext<
      PublicIdentity,
      PublicSession
    >,
    private readonly authentication: AuthenticationService,
  ) {}
  intercept(execution: ExecutionContext, next: CallHandler) {
    const user = this.context.user;
    const session = this.context.session;
    const request = execution.switchToHttp().getRequest<Request>();
    if (
      !user ||
      !session ||
      request.path === '/auth/me' ||
      (request.method === 'GET' &&
        /^\/notifications\/?$/u.test(request.path)) ||
      request.path === '/auth/sign-out'
    )
      return next.handle();
    // Only successfully authorized handlers refresh activity; errors and health probes do not.
    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        await this.authentication.recordActivity(
          user.accountId,
          session.id,
          requestId(request),
        );
        return result;
      }),
    );
  }
}
