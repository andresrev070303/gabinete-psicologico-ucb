import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import {
  normalizeIdentityName,
  validateNewPassword,
} from '../domain/identity-input.js';
import {
  normalizeContactPhone,
  normalizeDisableReason,
  validateOperationalRoles,
} from '../domain/account-lifecycle.rules.js';
import { InviteDirectorPipe } from './account-management.pipes.js';

export function accountFields(
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
function validated<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid account data.',
    );
  }
}
@Injectable()
export class InviteOperationalPipe implements PipeTransform {
  transform(value: unknown) {
    const input = accountFields(value, [
      'givenNames',
      'familyNames',
      'email',
      'roleCodes',
    ]);
    return validated(() => ({
      ...new InviteDirectorPipe().transform({
        givenNames: input.givenNames,
        familyNames: input.familyNames,
        email: input.email,
      }),
      roleCodes: validateOperationalRoles(input.roleCodes),
    }));
  }
}
@Injectable()
export class UpdateAccountPipe implements PipeTransform {
  transform(value: unknown) {
    const input = accountFields(value, [
      'givenNames',
      'familyNames',
      'contactPhone',
    ]);
    return validated(() => ({
      givenNames: normalizeIdentityName(input.givenNames, 'givenNames'),
      familyNames: normalizeIdentityName(input.familyNames, 'familyNames'),
      contactPhone: normalizeContactPhone(input.contactPhone),
    }));
  }
}
@Injectable()
export class OperationalRolesPipe implements PipeTransform {
  transform(value: unknown) {
    const input = accountFields(value, ['roleCodes']);
    return validated(() => ({
      roleCodes: validateOperationalRoles(input.roleCodes, true),
    }));
  }
}
@Injectable()
export class DisableAccountPipe implements PipeTransform {
  transform(value: unknown) {
    const input = accountFields(value, ['reason']);
    return validated(() => ({ reason: normalizeDisableReason(input.reason) }));
  }
}
@Injectable()
export class ChangePasswordPipe implements PipeTransform {
  transform(value: unknown) {
    const input = accountFields(value, ['currentPassword', 'newPassword']);
    if (
      typeof input.currentPassword !== 'string' ||
      input.currentPassword.length < 1 ||
      input.currentPassword.length > 1024
    )
      throw new BadRequestException('Provide your current password.');
    return validated(() => ({
      currentPassword: input.currentPassword as string,
      newPassword: validateNewPassword(input.newPassword),
    }));
  }
}
@Injectable()
export class ContactPhonePipe implements PipeTransform {
  transform(value: unknown) {
    const input = accountFields(value, ['contactPhone']);
    return validated(() => ({
      contactPhone: normalizeContactPhone(input.contactPhone),
    }));
  }
}
