import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { SignInInput } from '../application/authentication.contracts.js';

@Injectable()
export class SignInPipe implements PipeTransform<unknown, SignInInput> {
  transform(value: unknown): SignInInput {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Invalid sign-in data.');
    const fields = value as Record<string, unknown>;
    if (
      Object.keys(fields).some(
        (key) => key !== 'email' && key !== 'password',
      ) ||
      typeof fields.email !== 'string' ||
      typeof fields.password !== 'string'
    )
      throw new BadRequestException('Invalid sign-in data.');
    const email = fields.email.trim().toLowerCase();
    const parts = email.split('@');
    if (
      email.length > 254 ||
      parts.length !== 2 ||
      !parts[0] ||
      !parts[1].includes('.') ||
      /\s/u.test(email) ||
      fields.password.length === 0 ||
      Buffer.byteLength(fields.password, 'utf8') > 4096
    )
      throw new BadRequestException('Invalid sign-in data.');
    return { email, password: fields.password };
  }
}
