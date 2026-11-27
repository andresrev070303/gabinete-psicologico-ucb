import {
  GmailAccessLinkDelivery,
  ManualAccessLinkDelivery,
} from './access-link-delivery.js';
import type { AccountAction } from '../application/account-lifecycle.contracts.js';
const options = {
  sender: 'gabinetepsicologicoucb@gmail.com',
  publicUrl: 'https://gabinete.example.test/',
  clientId: 'client',
  clientSecret: 'secret',
  refreshToken: 'refresh',
};
const action: AccountAction = {
  account: {
    accountId: 'account',
    email: 'recipient@example.test',
    givenNames: 'Andrés',
    familyNames: 'Test',
    status: 'invited',
    roles: ['psychologist'],
    canAssignDirector: false,
  },
  expiresAt: '2026-11-27T12:00:00.000Z',
};
describe('Access link delivery', () => {
  it('keeps manual mode independent of any external provider', async () => {
    expect(await new ManualAccessLinkDelivery().deliver()).toBe('manual');
  });
  it('sends the exact invitation through HTTPS with a cached OAuth token and no password', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access', expires_in: 3600 }),
        ),
      )
      .mockImplementation(
        async () => new Response(JSON.stringify({ id: 'message' })),
      );
    const delivery = new GmailAccessLinkDelivery(options, fetcher);
    expect(await delivery.deliver(action, 'a'.repeat(43), 'activation')).toBe(
      'sent',
    );
    const raw = JSON.parse(fetcher.mock.calls[1][1].body as string)
      .raw as string;
    const mime = Buffer.from(raw, 'base64url').toString();
    const text = Buffer.from(mime.split('\r\n\r\n')[1], 'base64').toString();
    expect(mime).toContain(
      'From: Gabinete UCB <gabinetepsicologicoucb@gmail.com>',
    );
    expect(text).toContain('Hello Andrés');
    expect(text).toContain('#activate=' + 'a'.repeat(43));
    expect(text).not.toContain('secret');
    expect(
      await delivery.deliver(action, 'b'.repeat(43), 'password_reset'),
    ).toBe('sent');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([400, 401, 403, 429, 503])(
    'returns a recoverable delivery failure for provider status %s',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status }));
      expect(
        await new GmailAccessLinkDelivery(options, fetcher).deliver(
          action,
          'a'.repeat(43),
          'activation',
        ),
      ).toBe('failed');
    },
  );
  it('rejects header injection before contacting the provider', async () => {
    const fetcher = vi.fn();
    expect(
      await new GmailAccessLinkDelivery(options, fetcher).deliver(
        {
          ...action,
          account: {
            ...action.account,
            email: 'a@example.test\r\nBcc: other@example.test',
          },
        },
        'a'.repeat(43),
        'activation',
      ),
    ).toBe('failed');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 503])(
    'reports a send failure after successful OAuth (HTTP %s) without automatic retries',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ access_token: 'access', expires_in: 3600 }),
        )
        .mockResolvedValueOnce(new Response('{}', { status }));
      expect(
        await new GmailAccessLinkDelivery(options, fetcher).deliver(
          action,
          'a'.repeat(43),
          'activation',
        ),
      ).toBe('failed');
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it('handles a network exception without exposing credentials or the invitation', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error('provider private details'));
    expect(
      await new GmailAccessLinkDelivery(options, fetcher).deliver(
        action,
        'a'.repeat(43),
        'activation',
      ),
    ).toBe('failed');
  });
  it.each([
    {},
    { access_token: 42, expires_in: 3600 },
    { access_token: 'token', expires_in: 0 },
  ])('rejects malformed OAuth credentials %j', async (body) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    expect(
      await new GmailAccessLinkDelivery(options, fetcher).deliver(
        action,
        'a'.repeat(43),
        'activation',
      ),
    ).toBe('failed');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('requires a provider message identifier before reporting successful submission', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'access', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(Response.json({}));
    expect(
      await new GmailAccessLinkDelivery(options, fetcher).deliver(
        action,
        'a'.repeat(43),
        'activation',
      ),
    ).toBe('failed');
  });
  it('rejects insecure or incomplete provider configuration', () => {
    expect(
      () =>
        new GmailAccessLinkDelivery({
          ...options,
          publicUrl: 'http://remote.example.test',
        }),
    ).toThrow();
    expect(
      () => new GmailAccessLinkDelivery({ ...options, refreshToken: '' }),
    ).toThrow();
  });
});
