import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type {
  InviteDirectorInput,
  ActivateAccountInput,
} from '../application/account-management.contracts.js';
import {
  normalizeIdentityEmail,
  normalizeIdentityName,
  validateNewPassword,
} from '../domain/identity-input.js';

function fields(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new BadRequestException('Invalid account data.');
  return value as Record<string, unknown>;
}
@Injectable()
export class InviteDirectorPipe implements PipeTransform<
  unknown,
  InviteDirectorInput
> {
  transform(value: unknown): InviteDirectorInput {
    const input = fields(value, ['givenNames', 'familyNames', 'email']);
    try {
      return {
        givenNames: normalizeIdentityName(input.givenNames, 'givenNames'),
        familyNames: normalizeIdentityName(input.familyNames, 'familyNames'),
        email: normalizeIdentityEmail(input.email),
      };
    } catch {
      throw new BadRequestException(
        'Provide valid names and an email address.',
      );
    }
  }
}
@Injectable()
export class ActivateAccountPipe implements PipeTransform<
  unknown,
  ActivateAccountInput
> {
  transform(value: unknown): ActivateAccountInput {
    const input = fields(value, ['token', 'password']);
    if (typeof input.token !== 'string' || input.token.length > 128)
      throw new BadRequestException(
        'Provide an activation token and a password of 15 to 128 characters.',
      );
    try {
      return {
        token: input.token,
        password: validateNewPassword(input.password),
      };
    } catch {
      throw new BadRequestException(
        'password must contain between 15 and 128 characters.',
      );
    }
  }
}
@Injectable()
export class AccountPagePipe implements PipeTransform<
  unknown,
  { page: number; pageSize: number }
> {
  transform(value: unknown) {
    const input = fields(value, ['page', 'pageSize']);
    const page = input.page ?? '1';
    const pageSize = input.pageSize ?? '20';
    if (
      typeof page !== 'string' ||
      typeof pageSize !== 'string' ||
      !/^[1-9]\d{0,5}$/u.test(page) ||
      !/^[1-9]\d{0,2}$/u.test(pageSize) ||
      Number(pageSize) > 100
    )
      throw new BadRequestException('Invalid pagination.');
    return { page: Number(page), pageSize: Number(pageSize) };
  }
}
