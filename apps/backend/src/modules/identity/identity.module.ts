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
import { PasswordWorkLimiter } from './application/password-work-limiter.js';
import { ActivateAccountService } from './application/activate-account.service.js';
import { DirectorManagementService } from './application/director-management.service.js';
import { PostgresDirectorManagementStore } from './infrastructure/postgres-director-management.store.js';
import { AccountAccessPolicy } from './infrastructure/account-access.policy.js';
import { AccountActivationController } from './presentation/account-activation.controller.js';
import {
  AccountsController,
  RolesController,
} from './presentation/accounts.controller.js';
import {
  AccountPagePipe,
  ActivateAccountPipe,
  InviteDirectorPipe,
} from './presentation/account-management.pipes.js';

@Module({
  imports: [DatabaseModule],
  controllers: [
    AuthenticationController,
    AccountActivationController,
    AccountsController,
    RolesController,
  ],
  providers: [
    RoleDelegationPolicy,
    SessionTokens,
    SignInPipe,
    AccountAccessPolicy,
    PasswordWorkLimiter,
    AccountPagePipe,
    ActivateAccountPipe,
    InviteDirectorPipe,
    {
      provide: PostgresDirectorManagementStore,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        new PostgresDirectorManagementStore(database.db),
    },
    {
      provide: DirectorManagementService,
      inject: [PostgresDirectorManagementStore, SessionTokens],
      useFactory: (
        store: PostgresDirectorManagementStore,
        tokens: SessionTokens,
      ) => new DirectorManagementService(store, tokens),
    },
    {
      provide: ActivateAccountService,
      inject: [
        PostgresDirectorManagementStore,
        PasswordHasher,
        SessionTokens,
        PasswordWorkLimiter,
      ],
      useFactory: (
        store: PostgresDirectorManagementStore,
        passwords: PasswordHasher,
        tokens: SessionTokens,
        limiter: PasswordWorkLimiter,
      ) => new ActivateAccountService(store, passwords, tokens, limiter),
    },
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
      inject: [
        PostgresAuthenticationStore,
        PasswordHasher,
        SessionTokens,
        PasswordWorkLimiter,
      ],
      useFactory: (
        store: PostgresAuthenticationStore,
        passwords: PasswordHasher,
        tokens: SessionTokens,
        limiter: PasswordWorkLimiter,
      ) => new AuthenticationService(store, passwords, tokens, limiter),
    },
    OpaqueSessionProvider,
    SessionActivityInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: SessionActivityInterceptor },
  ],
})
export class IdentityModule {}
