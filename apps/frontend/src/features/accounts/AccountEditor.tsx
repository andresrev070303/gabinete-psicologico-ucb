import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountSummary, DirectorInvitation } from './accounts.types';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import {
  changeRoles,
  disableAccount,
  issuePasswordReset,
  reinviteAccount,
  updateAccount,
} from './account-lifecycle.api';
import { OperationalRoleFields } from './OperationalRoleFields';
import { selectedRoles } from './operational-roles';

export function AccountEditor({
  account,
  identity,
  onChanged,
  onLink,
  onClose,
}: {
  account: AccountSummary;
  identity: AuthenticatedIdentity['identity'];
  onChanged: () => Promise<void>;
  onLink: (link: DirectorInvitation) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const permitted = (permission: string) =>
    identity.permissions.includes(permission);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    work: (
      data: FormData,
      signal: AbortSignal,
    ) => Promise<void | DirectorInvitation>,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await work(data, controller.signal);
      if (!controller.signal.aborted) {
        if (result) onLink(result);
        await onChanged();
        onClose();
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'The operation failed.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const operational = account.managementKind === 'operational';
  return (
    <section aria-label={`Manage ${account.email}`} aria-busy={busy}>
      <h3>Manage {account.email}</h3>
      {error && <p role="alert">{error}</p>}
      {operational && permitted('accounts.update_operational') && (
        <form
          aria-label="Edit account profile"
          onSubmit={(event) => {
            void submit(event, (data, signal) =>
              updateAccount(
                account.accountId,
                {
                  givenNames: String(data.get('givenNames')),
                  familyNames: String(data.get('familyNames')),
                  contactPhone:
                    String(data.get('contactPhone') ?? '').trim() || null,
                },
                signal,
              ),
            );
          }}
        >
          <label>
            Given names
            <input
              name="givenNames"
              defaultValue={account.givenNames}
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Family names
            <input
              name="familyNames"
              defaultValue={account.familyNames}
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Contact phone
            <input
              name="contactPhone"
              type="tel"
              defaultValue={account.contactPhone ?? ''}
              maxLength={50}
              disabled={busy}
            />
          </label>
          <button disabled={busy}>Save profile</button>
        </form>
      )}
      {operational &&
        account.status !== 'disabled' &&
        permitted('roles.assign_operational') &&
        permitted('roles.revoke_operational') && (
          <form
            aria-label="Change operational roles"
            onSubmit={(event) => {
              void submit(event, (data, signal) =>
                changeRoles(account.accountId, selectedRoles(data), signal),
              );
            }}
          >
            <OperationalRoleFields roles={account.roles} disabled={busy} />
            <p>
              Changing roles signs this account out. An empty selection revokes
              all operational roles.
            </p>
            <button disabled={busy}>Save roles</button>
          </form>
        )}
      {account.status !== 'disabled' &&
        permitted(
          operational ? 'accounts.disable_operational' : 'director.disable',
        ) && (
          <form
            aria-label="Disable account"
            onSubmit={(event) => {
              void submit(event, (data, signal) =>
                disableAccount(
                  account.accountId,
                  String(data.get('reason')),
                  signal,
                ),
              );
            }}
          >
            <label>
              Disable reason
              <input
                name="reason"
                minLength={5}
                maxLength={240}
                required
                disabled={busy}
              />
            </label>
            <label>
              <input type="checkbox" required disabled={busy} />I confirm
              disabling this account and revoking its access.
            </label>
            <button disabled={busy}>Disable account</button>
          </form>
        )}
      {account.status !== 'active' &&
        permitted(
          operational ? 'accounts.reinvite_operational' : 'director.reinvite',
        ) && (
          <form
            aria-label="Reinvite account"
            onSubmit={(event) => {
              void submit(event, (data, signal) =>
                reinviteAccount(
                  account.accountId,
                  operational ? selectedRoles(data) : [],
                  signal,
                ),
              );
            }}
          >
            {operational && (
              <OperationalRoleFields
                roles={account.roles.length ? account.roles : ['psychologist']}
                disabled={busy}
              />
            )}
            <p>
              A new activation link replaces previous links. Revoked access is
              never restored automatically.
            </p>
            <button disabled={busy}>Create new invitation</button>
          </form>
        )}
      {account.status === 'active' &&
        permitted(
          operational
            ? 'credentials.issue_operational_reset'
            : 'credentials.issue_director_reset',
        ) && (
          <form
            aria-label="Issue password recovery"
            onSubmit={(event) => {
              void submit(event, (_data, signal) =>
                issuePasswordReset(account.accountId, signal),
              );
            }}
          >
            <label>
              <input type="checkbox" required disabled={busy} />I confirm
              issuing a private recovery link. Current sessions end when the
              password is reset.
            </label>
            <button disabled={busy}>Issue recovery link</button>
          </form>
        )}
      <button type="button" onClick={onClose} disabled={busy}>
        Close account editor
      </button>
    </section>
  );
}
