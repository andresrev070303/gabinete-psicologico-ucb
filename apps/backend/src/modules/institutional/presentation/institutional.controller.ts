import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
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
} from '../../identity/application/authentication.contracts.js';
import { identityActor } from '../../identity/presentation/identity-actor.js';
import { InstitutionalService } from '../application/institutional.service.js';
import type {
  ListQuery,
  NewRecord,
  RecordChange,
  StatusChange,
} from '../application/institutional.contracts.js';
import type { RecordKind } from '../domain/institutional.rules.js';
import { InstitutionalAccessPolicy } from './institutional-access.policy.js';
import { InstitutionalExceptionFilter } from './institutional-exception.filter.js';
import {
  InstitutionalInputPipe,
  parseNewRecord,
  parseRecordChange,
  parseStatus,
  parseArchive,
  parseList,
  parseKind,
  parseInstitution,
} from './institutional.inputs.js';
@Controller('institutional')
@UseFilters(InstitutionalExceptionFilter)
export class InstitutionalController {
  constructor(private readonly service: InstitutionalService) {}
  @Get('records')
  @Can(InstitutionalAccessPolicy, 'read')
  list(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Query(new InstitutionalInputPipe(parseList)) query: ListQuery,
  ) {
    return this.service.list(identityActor(user, session, request), query);
  }
  @Get('catalog')
  @Can(InstitutionalAccessPolicy, 'manage')
  catalog(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
  ) {
    return this.service.catalog(identityActor(user, session, request));
  }
  @Post('institutions')
  @Can(InstitutionalAccessPolicy, 'manage')
  institution(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Body(new InstitutionalInputPipe(parseInstitution))
    input: { id: string; name: string; kind: string },
  ) {
    return this.service.createInstitution(
      identityActor(user, session, request),
      input,
    );
  }
  @Post('records')
  @Can(InstitutionalAccessPolicy, 'manage')
  create(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Body(new InstitutionalInputPipe(parseNewRecord)) input: NewRecord,
  ) {
    return this.service.create(identityActor(user, session, request), input);
  }
  @Get('records/:kind/:id')
  @Can(InstitutionalAccessPolicy, 'read')
  details(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('kind', new InstitutionalInputPipe(parseKind)) kind: RecordKind,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.details(identityActor(user, session, request), {
      kind,
      id,
    });
  }
  @Patch('records/:kind/:id')
  @Can(InstitutionalAccessPolicy, 'manage')
  update(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('kind', new InstitutionalInputPipe(parseKind)) kind: RecordKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new InstitutionalInputPipe(parseRecordChange)) input: RecordChange,
  ) {
    return this.service.update(
      identityActor(user, session, request),
      { kind, id },
      input,
    );
  }
  @Post('records/:kind/:id/status')
  @HttpCode(200)
  @Can(InstitutionalAccessPolicy, 'manage')
  status(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('kind', new InstitutionalInputPipe(parseKind)) kind: RecordKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new InstitutionalInputPipe(parseStatus)) input: StatusChange,
  ) {
    return this.service.changeStatus(
      identityActor(user, session, request),
      { kind, id },
      input,
    );
  }
  @Post('records/:kind/:id/archive')
  @HttpCode(204)
  @Can(InstitutionalAccessPolicy, 'manage')
  archive(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('kind', new InstitutionalInputPipe(parseKind)) kind: RecordKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new InstitutionalInputPipe(parseArchive))
    input: { version: number; reason: string },
  ) {
    return this.service.archive(
      identityActor(user, session, request),
      { kind, id },
      input.version,
      input.reason,
    );
  }
}
