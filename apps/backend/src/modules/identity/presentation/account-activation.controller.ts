import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseFilters,
} from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import type { Request } from 'express';
import type { ActivateAccountInput } from '../application/account-management.contracts.js';
import { ActivateAccountService } from '../application/activate-account.service.js';
import { ActivateAccountPipe } from './account-management.pipes.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { requestId } from './session-cookie.js';

@Controller('auth')
@UseFilters(IdentityExceptionFilter)
export class AccountActivationController {
  constructor(private readonly activation: ActivateAccountService) {}
  @Public()
  @Post('activations')
  @HttpCode(204)
  activate(
    @Body(ActivateAccountPipe) input: ActivateAccountInput,
    @Req() request: Request,
  ) {
    return this.activation.activate(input, requestId(request));
  }
}
