import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { RoleDelegationPolicy } from './domain/role-delegation.policy.js';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PasswordHasher } from '@nestjs/authentication';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { AuthenticationService } from './application/authentication.service.js';
import { PostgresAuthenticationStore } from './infrastructure/postgres-authentication.store.js';
import { SessionTokens } from './infrastructure/session-tokens.js';
import { SessionCookie } from './presentation/session-cookie.js';
import { OpaqueSessionProvider } from './presentation/opaque-session.provider.js';
import { AuthenticationController } from './presentation/authentication.controller.js';
import { SessionActivityInterceptor } from './presentation/session-activity.interceptor.js';
import { SignInPipe } from './presentation/sign-in.pipe.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthenticationController],
  providers: [
    RoleDelegationPolicy,
    SessionTokens,
    SignInPipe,
    {
      provide: PostgresAuthenticationStore,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        new PostgresAuthenticationStore(database.db),
    },
    {
      provide: SessionCookie,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new SessionCookie(config.get('NODE_ENV') === 'production'),
    },
    {
      provide: AuthenticationService,
      inject: [PostgresAuthenticationStore, PasswordHasher, SessionTokens],
      useFactory: (
        store: PostgresAuthenticationStore,
        passwords: PasswordHasher,
        tokens: SessionTokens,
      ) => new AuthenticationService(store, passwords, tokens),
    },
    OpaqueSessionProvider,
    SessionActivityInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: SessionActivityInterceptor },
  ],
})
export class IdentityModule {}
