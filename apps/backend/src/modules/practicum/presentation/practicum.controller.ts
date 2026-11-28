import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import { CurrentSession, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { Request } from 'express';
import type {
  PublicIdentity,
  PublicSession,
} from '../../identity/application/authentication.contracts.js';
import { identityActor } from '../../identity/presentation/identity-actor.js';
import { PlacementService } from '../application/placement.service.js';
import { PracticeWorkService } from '../application/practice-work.service.js';
import type {
  EntryChange,
  NewPlacement,
  NewTask,
  PageQuery,
  PlacementChange,
  StartTimer,
  ResumeEntry,
  StopTimer,
  TaskChange,
} from '../application/practicum.contracts.js';
import { PracticumAccessPolicy } from './practicum-access.policy.js';
import { PracticumExceptionFilter } from './practicum-exception.filter.js';
import {
  PracticumInputPipe,
  parseEntryChange,
  parseEmpty,
  parsePage,
  parsePlacement,
  parsePlacementChange,
  parseStartTimer,
  parseResumeEntry,
  parseStopTimer,
  parseTask,
  parseTaskChange,
  parseVoidEntry,
} from './practicum.inputs.js';

@Controller('practicum')
@UseFilters(PracticumExceptionFilter)
export class PracticumController {
  constructor(
    private readonly placements: PlacementService,
    private readonly work: PracticeWorkService,
  ) {}
  @Get('my-placements')
  @Can(PracticumAccessPolicy, 'own')
  own(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Query(new PracticumInputPipe(parsePage)) page: PageQuery,
  ) {
    return this.placements.own(identityActor(user, session, request), page);
  }
  @Post('my-placement')
  @HttpCode(200)
  @Can(PracticumAccessPolicy, 'track')
  initializeOwn(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Body(new PracticumInputPipe(parseEmpty)) _input: Record<string, never>,
  ) {
    return this.placements.initializeOwn(identityActor(user, session, request));
  }
  @Get('practitioners')
  @Can(PracticumAccessPolicy, 'manage')
  directory(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Query(new PracticumInputPipe(parsePage)) page: PageQuery,
  ) {
    return this.placements.directory(
      identityActor(user, session, request),
      page,
    );
  }
  @Get('catalog')
  @Can(PracticumAccessPolicy, 'manage')
  catalog(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
  ) {
    return this.placements.catalog(identityActor(user, session, request));
  }
  @Get('placements')
  @Can(PracticumAccessPolicy, 'read')
  list(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Query(new PracticumInputPipe(parsePage)) page: PageQuery,
  ) {
    return this.placements.list(identityActor(user, session, request), page);
  }
  @Post('placements')
  @Can(PracticumAccessPolicy, 'manage')
  create(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Body(new PracticumInputPipe(parsePlacement)) input: NewPlacement,
  ) {
    return this.placements.create(identityActor(user, session, request), input);
  }
  @Get('placements/:id')
  @Can(PracticumAccessPolicy, 'read')
  details(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.placements.details(identityActor(user, session, request), id);
  }
  @Patch('placements/:id')
  @Can(PracticumAccessPolicy, 'manage')
  update(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new PracticumInputPipe(parsePlacementChange)) input: PlacementChange,
  ) {
    return this.placements.update(
      identityActor(user, session, request),
      id,
      input,
    );
  }
  @Get('placements/:id/tasks')
  @Can(PracticumAccessPolicy, 'read')
  tasks(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new PracticumInputPipe(parsePage)) page: PageQuery,
  ) {
    return this.work.tasks(identityActor(user, session, request), id, page);
  }
  @Post('placements/:id/tasks')
  @Can(PracticumAccessPolicy, 'edit')
  createTask(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new PracticumInputPipe(parseTask)) input: NewTask,
  ) {
    return this.work.createTask(
      identityActor(user, session, request),
      id,
      input,
    );
  }
  @Patch('placements/:id/tasks/:taskId')
  @Can(PracticumAccessPolicy, 'manage')
  updateTask(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(new PracticumInputPipe(parseTaskChange)) input: TaskChange,
  ) {
    return this.work.updateTask(
      identityActor(user, session, request),
      id,
      taskId,
      input,
    );
  }
  @Get('placements/:id/entries')
  @Can(PracticumAccessPolicy, 'read')
  entries(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new PracticumInputPipe(parsePage)) page: PageQuery,
  ) {
    return this.work.entries(identityActor(user, session, request), id, page);
  }
  @Post('placements/:id/timer')
  @Can(PracticumAccessPolicy, 'track')
  start(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new PracticumInputPipe(parseStartTimer)) input: StartTimer,
  ) {
    return this.work.start(identityActor(user, session, request), id, input);
  }
  @Get('running-timer')
  @Can(PracticumAccessPolicy, 'track')
  timer(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
  ) {
    return this.work.runningTimer(identityActor(user, session, request));
  }
  @Post('entries/:id/stop')
  @HttpCode(200)
  @Can(PracticumAccessPolicy, 'track')
  stop(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new PracticumInputPipe(parseStopTimer)) input: StopTimer,
  ) {
    return this.work.stop(identityActor(user, session, request), id, input);
  }
  @Post('entries/:id/resume')
  @Can(PracticumAccessPolicy, 'track')
  resume(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new PracticumInputPipe(parseResumeEntry)) input: ResumeEntry,
  ) {
    return this.work.resume(identityActor(user, session, request), id, input);
  }
  @Patch('entries/:id')
  @Can(PracticumAccessPolicy, 'track')
  edit(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new PracticumInputPipe(parseEntryChange)) input: EntryChange,
  ) {
    return this.work.edit(identityActor(user, session, request), id, input);
  }
  @Post('entries/:id/void')
  @HttpCode(200)
  @Can(PracticumAccessPolicy, 'track')
  void(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new PracticumInputPipe(parseVoidEntry))
    input: { version: number; reason: string },
  ) {
    return this.work.void(
      identityActor(user, session, request),
      id,
      input.version,
      input.reason,
    );
  }
  @Get('entries/:id/history')
  @Can(PracticumAccessPolicy, 'read')
  history(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.work.revisions(identityActor(user, session, request), id);
  }
}
