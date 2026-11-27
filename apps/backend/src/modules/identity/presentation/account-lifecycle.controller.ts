import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import { CurrentSession, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { Request, Response } from 'express';
import type {
  PublicIdentity,
  PublicSession,
} from '../application/authentication.contracts.js';
import type {
  InviteOperationalInput,
  UpdateAccountInput,
} from '../application/account-lifecycle.contracts.js';
import type { OperationalRole } from '../domain/account-lifecycle.rules.js';
import { AccountLifecycleService } from '../application/account-lifecycle.service.js';
import { AccountAccessPolicy } from '../infrastructure/account-access.policy.js';
import { AccountPagePipe } from './account-management.pipes.js';
import {
  ChangePasswordPipe,
  ContactPhonePipe,
  DisableAccountPipe,
  InviteOperationalPipe,
  OperationalRolesPipe,
  UpdateAccountPipe,
} from './account-lifecycle.pipes.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { identityActor } from './identity-actor.js';
import { SessionCookie } from './session-cookie.js';

@Controller('accounts')
@UseFilters(IdentityExceptionFilter)
export class AccountLifecycleController {
  constructor(private readonly accounts: AccountLifecycleService) {}
  @Post('operational-invitations')
  @Can(AccountAccessPolicy, 'inviteOperational')
  invite(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Body(InviteOperationalPipe) input: InviteOperationalInput,
  ) {
    return this.accounts.invite(identityActor(user, session, request), input);
  }
  @Patch(':id/profile')
  @Can(AccountAccessPolicy, 'updateOperational')
  @HttpCode(204)
  update(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(UpdateAccountPipe) input: UpdateAccountInput,
  ) {
    return this.accounts.update(
      identityActor(user, session, request),
      id,
      input,
    );
  }
  @Put(':id/roles')
  @Can(AccountAccessPolicy, 'manageOperationalRoles')
  @HttpCode(204)
  roles(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(OperationalRolesPipe) input: { roleCodes: OperationalRole[] },
  ) {
    return this.accounts.changeRoles(
      identityActor(user, session, request),
      id,
      input.roleCodes,
    );
  }
  @Post(':id/disable')
  @Can(AccountAccessPolicy, 'disableAccount')
  @HttpCode(204)
  disable(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(DisableAccountPipe) input: { reason: string },
  ) {
    return this.accounts.disable(
      identityActor(user, session, request),
      id,
      input.reason,
    );
  }
  @Post(':id/reinvitations')
  @Can(AccountAccessPolicy, 'reinviteAccount')
  reinvite(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(OperationalRolesPipe) input: { roleCodes: OperationalRole[] },
  ) {
    return this.accounts.reinvite(
      identityActor(user, session, request),
      id,
      input.roleCodes,
    );
  }
  @Post(':id/password-reset-invitations')
  @Can(AccountAccessPolicy, 'resetAccount')
  reset(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.issueReset(identityActor(user, session, request), id);
  }
}
@Controller('auth')
@UseFilters(IdentityExceptionFilter)
export class OwnAccessController {
  constructor(
    private readonly accounts: AccountLifecycleService,
    private readonly cookie: SessionCookie,
  ) {}
  @Get('sessions')
  @Can.Anyone()
  sessions(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
  ) {
    return this.accounts.sessions(identityActor(user, session, request));
  }
  @Post('sessions/:id/revocations')
  @Can.Anyone()
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.accounts.revokeSession(
      identityActor(user, session, request),
      id,
    );
    if (id === session.id)
      response.clearCookie(this.cookie.name, this.cookie.options);
  }
  @Post('password-change')
  @Can.Anyone()
  @HttpCode(204)
  async password(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(ChangePasswordPipe)
    input: { currentPassword: string; newPassword: string },
  ) {
    await this.accounts.changePassword(
      identityActor(user, session, request),
      input.currentPassword,
      input.newPassword,
    );
    response.clearCookie(this.cookie.name, this.cookie.options);
  }
  @Get('contact')
  @Can.Anyone()
  contact(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
  ) {
    return this.accounts.contact(identityActor(user, session, request));
  }
  @Put('contact')
  @Can.Anyone()
  @HttpCode(204)
  updateContact(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Body(ContactPhonePipe) input: { contactPhone: string | null },
  ) {
    return this.accounts.updateContact(
      identityActor(user, session, request),
      input.contactPhone,
    );
  }
}
@Controller('identity-audit')
@UseFilters(IdentityExceptionFilter)
export class IdentityAuditController {
  constructor(private readonly accounts: AccountLifecycleService) {}
  @Get()
  @Can(AccountAccessPolicy, 'readAudit')
  list(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Query(AccountPagePipe) page: { page: number; pageSize: number },
  ) {
    return this.accounts.audit(
      identityActor(user, session, request),
      page.page,
      page.pageSize,
    );
  }
}
