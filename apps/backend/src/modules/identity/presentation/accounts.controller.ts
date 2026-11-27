import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  HttpCode,
  UseFilters,
} from '@nestjs/common';
import { CurrentUser, CurrentSession } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { Request } from 'express';
import type {
  PublicIdentity,
  PublicSession,
} from '../application/authentication.contracts.js';
import type { InviteDirectorInput } from '../application/account-management.contracts.js';
import { DirectorManagementService } from '../application/director-management.service.js';
import { AccountAccessPolicy } from '../infrastructure/account-access.policy.js';
import {
  AccountPagePipe,
  InviteDirectorPipe,
} from './account-management.pipes.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { identityActor as actor } from './identity-actor.js';
@Controller('accounts')
@UseFilters(IdentityExceptionFilter)
export class AccountsController {
  constructor(private readonly accounts: DirectorManagementService) {}
  @Get()
  @Can(AccountAccessPolicy, 'readAccounts')
  list(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Query(AccountPagePipe) page: { page: number; pageSize: number },
  ) {
    return this.accounts.list(
      actor(user, session, request),
      page.page,
      page.pageSize,
    );
  }
  @Post('director-invitations')
  @Can(AccountAccessPolicy, 'inviteDirector')
  invite(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Body(InviteDirectorPipe) input: InviteDirectorInput,
  ) {
    return this.accounts.invite(actor(user, session, request), input);
  }
  @Post(':id/director-assignment')
  @Can(AccountAccessPolicy, 'assignDirector')
  @HttpCode(204)
  assign(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) accountId: string,
  ) {
    return this.accounts.assign(actor(user, session, request), accountId);
  }
}
@Controller('roles')
@UseFilters(IdentityExceptionFilter)
export class RolesController {
  constructor(private readonly accounts: DirectorManagementService) {}
  @Get()
  @Can(AccountAccessPolicy, 'readRoles')
  list(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
  ) {
    return this.accounts.roles(actor(user, session, request));
  }
}
