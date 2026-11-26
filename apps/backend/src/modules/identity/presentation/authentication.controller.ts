import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CurrentSession, CurrentUser, Public } from '@nestjs/authentication';
import type { Request, Response } from 'express';
import { AuthenticationService } from '../application/authentication.service.js';
import { AuthenticationFailure } from '../application/authentication.contracts.js';
import type {
  PublicIdentity,
  PublicSession,
  SignInInput,
} from '../application/authentication.contracts.js';
import { SessionCookie, requestId } from './session-cookie.js';
import { SignInPipe } from './sign-in.pipe.js';
import { Can } from '@nestjs/authorization';

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly cookie: SessionCookie,
  ) {}

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body(SignInPipe) input: SignInInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const result = await this.authentication.signIn(
        input,
        requestId(request),
        this.cookie.read(request),
      );
      response.cookie(this.cookie.name, result.token, {
        ...this.cookie.options,
        expires: new Date(result.session.expiresAt),
      });
      return { identity: result.identity, session: result.session };
    } catch (error) {
      if (!(error instanceof AuthenticationFailure)) throw error;
      const status =
        error.kind === 'invalid_credentials'
          ? 401
          : error.kind === 'rate_limited'
            ? 429
            : 503;
      if (status !== 401)
        response.setHeader(
          'Retry-After',
          error.kind === 'rate_limited' ? '900' : '1',
        );
      throw new HttpException(error.message, status);
    }
  }

  @Get('me')
  @Can.Anyone()
  me(
    @CurrentUser() identity: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return { identity, session };
  }

  @Post('sign-out')
  @Can.Anyone()
  @HttpCode(204)
  async signOut(
    @CurrentUser() identity: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    try {
      await this.authentication.signOut(
        identity.accountId,
        session.id,
        requestId(request),
      );
    } catch {
      throw new HttpException(
        'Authentication is temporarily unavailable.',
        503,
      );
    }
    response.clearCookie(this.cookie.name, this.cookie.options);
  }
}
