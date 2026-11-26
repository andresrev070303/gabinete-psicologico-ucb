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
    const givenNames = this.validateName(input.givenNames, 'givenNames');
    const familyNames = this.validateName(input.familyNames, 'familyNames');
    const email = input.email.trim().toLowerCase();
    const [localPart, domain, extraPart] = email.split('@');
    if (
      email.length > 254 ||
      !localPart ||
      localPart.length > 64 ||
      !domain ||
      extraPart !== undefined ||
      /\s/u.test(email) ||
      !domain.includes('.') ||
      domain
        .split('.')
        .some((label) => !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/u.test(label))
    ) {
      throw new Error(
        'email must be a valid address with at most 254 characters.',
      );
    }
    // Count Unicode characters and preserve the exact password, including spaces.
    const passwordLength = Array.from(input.password).length;
    if (passwordLength < 15 || passwordLength > 128) {
      throw new Error('password must contain between 15 and 128 characters.');
    }
    const passwordHash = await this.passwords.hash(input.password);
    return this.store.createFirstAdministrator({
      givenNames,
      familyNames,
      email,
      passwordHash,
    });
  }

  private validateName(value: string, field: string): string {
    const name = value.trim();
    if (name.length === 0 || Array.from(name).length > 160) {
      throw new Error(`${field} must contain between 1 and 160 characters.`);
    }
    return name;
  }
}
