import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { RoleDelegationPolicy } from './domain/role-delegation.policy.js';
import { IdentityTransactions } from './infrastructure/identity-transactions.js';
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
import { AccountLifecycleService } from './application/account-lifecycle.service.js';
import type { AccessLinkDelivery } from './application/account-lifecycle.contracts.js';
import { PostgresAccountLifecycleStore } from './infrastructure/postgres-account-lifecycle.store.js';
import {
  ACCESS_LINK_DELIVERY,
  GmailAccessLinkDelivery,
  ManualAccessLinkDelivery,
} from './infrastructure/access-link-delivery.js';
import {
  AccountLifecycleController,
  OwnAccessController,
  IdentityAuditController,
} from './presentation/account-lifecycle.controller.js';
import {
  ChangePasswordPipe,
  ContactPhonePipe,
  DisableAccountPipe,
  InviteOperationalPipe,
  OperationalRolesPipe,
  UpdateAccountPipe,
} from './presentation/account-lifecycle.pipes.js';
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
    AccountLifecycleController,
    OwnAccessController,
    IdentityAuditController,
  ],
  providers: [
    {
      provide: IdentityTransactions,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        new IdentityTransactions(database.db),
    },
    RoleDelegationPolicy,
    SessionTokens,
    SignInPipe,
    AccountAccessPolicy,
    PasswordWorkLimiter,
    AccountPagePipe,
    ActivateAccountPipe,
    InviteDirectorPipe,
    ChangePasswordPipe,
    ContactPhonePipe,
    DisableAccountPipe,
    InviteOperationalPipe,
    OperationalRolesPipe,
    UpdateAccountPipe,
    {
      provide: ACCESS_LINK_DELIVERY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AccessLinkDelivery => {
        const mode = config.get<string>('IDENTITY_EMAIL_MODE') ?? 'manual';
        if (mode === 'manual') return new ManualAccessLinkDelivery();
        if (mode !== 'gmail')
          throw new Error('IDENTITY_EMAIL_MODE must be manual or gmail.');
        return new GmailAccessLinkDelivery({
          sender: config.getOrThrow<string>('GMAIL_SENDER'),
          publicUrl: config.getOrThrow<string>('IDENTITY_PUBLIC_URL'),
          clientId: config.getOrThrow<string>('GMAIL_CLIENT_ID'),
          clientSecret: config.getOrThrow<string>('GMAIL_CLIENT_SECRET'),
          refreshToken: config.getOrThrow<string>('GMAIL_REFRESH_TOKEN'),
        });
      },
    },
    {
      provide: PostgresAccountLifecycleStore,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        new PostgresAccountLifecycleStore(database.db),
    },
    {
      provide: AccountLifecycleService,
      inject: [
        PostgresAccountLifecycleStore,
        SessionTokens,
        ACCESS_LINK_DELIVERY,
        PasswordHasher,
        PasswordWorkLimiter,
      ],
      useFactory: (
        store: PostgresAccountLifecycleStore,
        tokens: SessionTokens,
        delivery: AccessLinkDelivery,
        passwords: PasswordHasher,
        limiter: PasswordWorkLimiter,
      ) =>
        new AccountLifecycleService(
          store,
          tokens,
          delivery,
          passwords,
          limiter,
        ),
    },
    {
      provide: PostgresDirectorManagementStore,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        new PostgresDirectorManagementStore(database.db),
    },
    {
      provide: DirectorManagementService,
      inject: [
        PostgresDirectorManagementStore,
        SessionTokens,
        ACCESS_LINK_DELIVERY,
      ],
      useFactory: (
        store: PostgresDirectorManagementStore,
        tokens: SessionTokens,
        delivery: AccessLinkDelivery,
      ) => new DirectorManagementService(store, tokens, delivery),
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
  exports: [IdentityTransactions],
})
export class IdentityModule {}
