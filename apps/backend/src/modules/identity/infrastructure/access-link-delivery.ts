import type {
  AccessLinkDelivery,
  AccountAction,
} from '../application/account-lifecycle.contracts.js';
import { normalizeIdentityEmail } from '../domain/identity-input.js';

export const ACCESS_LINK_DELIVERY = Symbol('ACCESS_LINK_DELIVERY');
export class ManualAccessLinkDelivery implements AccessLinkDelivery {
  deliver(): Promise<'manual'> {
    return Promise.resolve('manual');
  }
}
export type GmailDeliveryOptions = Readonly<{
  sender: string;
  publicUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}>;
export class GmailAccessLinkDelivery implements AccessLinkDelivery {
  private cached: { token: string; expiresAt: number } | null = null;
  private readonly options: GmailDeliveryOptions;
  constructor(
    options: GmailDeliveryOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(options.publicUrl);
    if (
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !options.clientId ||
      !options.clientSecret ||
      !options.refreshToken
    )
      throw new Error(
        'Provide valid Gmail OAuth credentials and IDENTITY_PUBLIC_URL.',
      );
    this.options = {
      ...options,
      sender: normalizeIdentityEmail(options.sender),
      publicUrl: url.toString(),
    };
  }
  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.token;
    const response = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok) throw new Error('Gmail authorization is unavailable.');
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      !('access_token' in data) ||
      typeof data.access_token !== 'string' ||
      !('expires_in' in data) ||
      typeof data.expires_in !== 'number' ||
      data.expires_in < 60 ||
      data.expires_in > 86400
    )
      throw new Error('Gmail authorization is unavailable.');
    this.cached = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  }
  async deliver(
    action: AccountAction,
    token: string,
    purpose: 'activation' | 'password_reset',
  ): Promise<'sent' | 'failed'> {
    try {
      const recipient = normalizeIdentityEmail(action.account.email);
      // Keep MIME address headers ASCII and reject characters that could create extra headers or recipients.
      if (
        !/^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d.-]+$/iu.test(recipient) ||
        !/^[a-z\d.+_-]+@gmail\.com$/iu.test(this.options.sender) ||
        !/^[A-Za-z0-9_-]{43}$/u.test(token)
      )
        return 'failed';
      const url = new URL(this.options.publicUrl);
      url.hash = `activate=${token}`;
      const body = [
        `Hello ${action.account.givenNames},`,
        '',
        purpose === 'activation'
          ? 'You have been invited to Gabinete UCB.'
          : 'A password recovery link has been issued for your Gabinete UCB account.',
        `Sign-in email: ${recipient}`,
        'Choose your own password using this private, one-use link:',
        url.toString(),
        `Expires at: ${action.expiresAt}`,
        '',
        'Never share your password or this link. Contact the Gabinete if you did not expect this message.',
      ].join('\r\n');
      const mime = [
        `From: Gabinete UCB <${this.options.sender}>`,
        `To: ${recipient}`,
        `Subject: ${purpose === 'activation' ? 'Activate your Gabinete UCB account' : 'Recover your Gabinete UCB access'}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(body)
          .toString('base64')
          .match(/.{1,76}/gu)!
          .join('\r\n'),
      ].join('\r\n');
      const response = await this.fetcher(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: `Bearer ${await this.accessToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: Buffer.from(mime).toString('base64url'),
          }),
        },
      );
      if (!response.ok) {
        this.cached = null;
        return 'failed';
      }
      const result: unknown = await response.json();
      return result &&
        typeof result === 'object' &&
        'id' in result &&
        typeof result.id === 'string'
        ? 'sent'
        : 'failed';
    } catch {
      this.cached = null;
      return 'failed';
    }
  }
}
