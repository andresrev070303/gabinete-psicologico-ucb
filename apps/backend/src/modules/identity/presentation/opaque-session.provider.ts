import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  AuthenticationProvider,
  AuthenticationRegistry,
} from '@nestjs/authentication';
import type { Request } from 'express';
import type {
  PublicIdentity,
  PublicSession,
} from '../application/authentication.contracts.js';
import { AuthenticationService } from '../application/authentication.service.js';
import { SessionCookie } from './session-cookie.js';

@Injectable()
export class OpaqueSessionProvider extends AuthenticationProvider<
  PublicIdentity,
  PublicSession
> {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly cookie: SessionCookie,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }
  async authenticate(context: ExecutionContext) {
    if (context.getType() !== 'http') return null;
    const token = this.cookie.read(
      context.switchToHttp().getRequest<Request>(),
    );
    if (!token) return null;
    try {
      const found = await this.authentication.authenticate(token);
      return found ? { user: found.identity, session: found.session } : null;
    } catch {
      throw new ServiceUnavailableException(
        'Authentication is temporarily unavailable.',
      );
    }
  }
}
