import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseFilters,
  BadRequestException,
} from '@nestjs/common';
import { CurrentSession, CurrentUser } from '@nestjs/authentication';
import { Can, Policy } from '@nestjs/authorization';
import type { Request } from 'express';
import type {
  PublicIdentity,
  PublicSession,
} from '../../identity/application/authentication.contracts.js';
import { identityActor } from '../../identity/presentation/identity-actor.js';
import { NotificationExceptionFilter } from './notification-exception.filter.js';
import { canReadNotifications } from '../domain/notification.rules.js';
import { NotificationService } from '../application/notification.service.js';
@Policy()
export class NotificationAccessPolicy {
  read(user: PublicIdentity | null) {
    return canReadNotifications(user);
  }
}
@Controller('notifications')
@UseFilters(NotificationExceptionFilter)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}
  @Get()
  @Can(NotificationAccessPolicy, 'read')
  list(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ) {
    if (
      Object.keys(query).some((key) => key !== 'cursor') ||
      (query.cursor !== undefined && typeof query.cursor !== 'string')
    )
      throw new BadRequestException();
    return this.notifications.list(
      identityActor(user, session, request),
      typeof query.cursor === 'string' ? query.cursor : null,
    );
  }
  @Post(':id/read')
  @HttpCode(204)
  @Can(NotificationAccessPolicy, 'read')
  read(
    @CurrentUser() user: PublicIdentity,
    @CurrentSession() session: PublicSession,
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    if (
      body !== undefined &&
      (!body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length)
    )
      throw new BadRequestException();
    return this.notifications.markRead(
      identityActor(user, session, request),
      id,
    );
  }
}
