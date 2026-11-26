import {
  normalizeIdentityEmail,
  normalizeIdentityName,
  validateNewPassword,
} from '../domain/identity-input.js';

export type BootstrapAdministratorInput = Readonly<{
  givenNames: string;
  familyNames: string;
  email: string;
  password: string;
}>;

export type NewAdministratorRecord = Readonly<{
  givenNames: string;
  familyNames: string;
  email: string;
  passwordHash: string;
}>;

export type AdministratorIdentity = Readonly<{
  accountId: string;
  personId: string;
  email: string;
  roleCode: 'administrator';
}>;

export interface AdministratorBootstrapStore {
  createFirstAdministrator(
    input: NewAdministratorRecord,
  ): Promise<AdministratorIdentity>;
}

export interface PasswordHashGenerator {
  hash(password: string): Promise<string>;
}

/** A local installation use case. It is deliberately not registered as an HTTP provider. */
export class BootstrapAdministrator {
  constructor(
    private readonly store: AdministratorBootstrapStore,
    private readonly passwords: PasswordHashGenerator,
  ) {}

  async execute(
    input: BootstrapAdministratorInput,
  ): Promise<AdministratorIdentity> {
    const givenNames = normalizeIdentityName(input.givenNames, 'givenNames');
    const familyNames = normalizeIdentityName(input.familyNames, 'familyNames');
    const email = normalizeIdentityEmail(input.email);
    const passwordHash = await this.passwords.hash(
      validateNewPassword(input.password),
    );
    return this.store.createFirstAdministrator({
      givenNames,
      familyNames,
      email,
      passwordHash,
    });
  }
}
