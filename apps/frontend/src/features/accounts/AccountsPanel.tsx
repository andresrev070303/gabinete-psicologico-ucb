import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { listAccounts, inviteDirector, assignDirector } from './accounts.api';
import { inviteOperational } from './account-lifecycle.api';
import { OperationalRoleFields } from './OperationalRoleFields';
import { selectedRoles } from './operational-roles';
import { InvitationResult } from './InvitationResult';
import { AccountEditor } from './AccountEditor';
import type {
  AccountPage,
  AccountSummary,
  DirectorInvitation,
} from './accounts.types';

export function AccountsPanel({
  identity,
}: {
  identity: AuthenticatedIdentity['identity'];
}) {
  const [accounts, setAccounts] = useState<AccountPage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<DirectorInvitation | null>(null);
  const [selected, setSelected] = useState<AccountSummary | null>(null);
  const [managed, setManaged] = useState<AccountSummary | null>(null);
  const active = useRef<AbortController | null>(null);
  const fail = (failure: unknown) =>
    setError(
      failure instanceof Error
        ? failure.message
        : 'The operation failed. Try again.',
    );
  async function fetchPage(page: number, controller: AbortController) {
    try {
      const result = await listAccounts(page, controller.signal);
      if (!controller.signal.aborted) setAccounts(result);
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function load(page: number) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    await fetchPage(page, controller);
  }
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    void listAccounts(1, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setAccounts(result);
          setBusy(false);
        }
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'The operation failed. Try again.',
          );
          setBusy(false);
        }
      },
    );
    return () => active.current?.abort();
  }, []);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setInvitation(null);
    try {
      const input = {
        givenNames: String(data.get('givenNames') ?? ''),
        familyNames: String(data.get('familyNames') ?? ''),
        email: String(data.get('email') ?? ''),
      };
      const result = canInviteOperational
        ? await inviteOperational(
            { ...input, roleCodes: selectedRoles(data) },
            controller.signal,
          )
        : await inviteDirector(input, controller.signal);
      if (!controller.signal.aborted) {
        setInvitation(result);
        form.reset();
        await load(1);
      }
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function designate() {
    if (!selected) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    try {
      await assignDirector(selected.accountId, controller.signal);
      if (!controller.signal.aborted) {
        setSelected(null);
        await load(accounts?.page ?? 1);
      }
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const canInviteDirector =
    identity.roles.includes('administrator') &&
    identity.permissions.includes('accounts.invite_director_candidate');
  const canInviteOperational =
    identity.roles.includes('director') &&
    identity.permissions.includes('accounts.invite_operational');
  const canInvite = canInviteDirector || canInviteOperational;
  const canAssign =
    identity.roles.includes('administrator') &&
    identity.permissions.includes('director.assign');
  return (
    <section
      className="accounts-panel"
      aria-labelledby="accounts-title"
      aria-busy={busy}
    >
      <h2 id="accounts-title">Accounts</h2>
      {error && <p role="alert">{error}</p>}
      {canInvite && (
        <form
          aria-label={
            canInviteOperational
              ? 'Invite operational account'
              : 'Invite director candidate'
          }
          onSubmit={(event) => {
            void invite(event);
          }}
        >
          <h3>
            {canInviteOperational
              ? 'Invite an operational account'
              : 'Invite a director candidate'}
          </h3>
          <label>
            Given names
            <input
              name="givenNames"
              autoComplete="off"
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Family names
            <input
              name="familyNames"
              autoComplete="off"
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="off"
              maxLength={254}
              required
              disabled={busy}
            />
          </label>
          {canInviteOperational && <OperationalRoleFields disabled={busy} />}
          <button type="submit" disabled={busy}>
            Create invitation
          </button>
        </form>
      )}
      {invitation && (
        <InvitationResult
          invitation={invitation}
          onDismiss={() => setInvitation(null)}
        />
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void load(accounts?.page ?? 1);
        }}
      >
        Refresh accounts
      </button>
      <div className="accounts-table">
        <table>
          <caption>Accounts visible to your role</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts?.items.map((account) => (
              <tr key={account.accountId}>
                <td>
                  {account.givenNames} {account.familyNames}
                </td>
                <td>{account.email}</td>
                <td>{account.status}</td>
                <td>{account.roles.join(', ') || 'No assigned roles'}</td>
                <td>
                  {((account.managementKind === 'operational' &&
                    identity.roles.includes('director')) ||
                    (account.managementKind === 'director' &&
                      identity.roles.includes('administrator'))) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setManaged(account);
                        setInvitation(null);
                      }}
                    >
                      Manage account
                    </button>
                  )}
                  {canAssign && account.canAssignDirector && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSelected(account)}
                    >
                      Assign director
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {accounts && accounts.total === 0 && (
        <p>No accounts are visible to your role.</p>
      )}
      {accounts && (
        <nav aria-label="Account pages">
          <button
            type="button"
            disabled={busy || accounts.page === 1}
            onClick={() => {
              void load(accounts.page - 1);
            }}
          >
            Previous
          </button>
          <span>Page {accounts.page}</span>
          <button
            type="button"
            disabled={
              busy || accounts.page * accounts.pageSize >= accounts.total
            }
            onClick={() => {
              void load(accounts.page + 1);
            }}
          >
            Next
          </button>
        </nav>
      )}
      {managed && (
        <AccountEditor
          key={managed.accountId}
          account={managed}
          identity={identity}
          onChanged={() => load(accounts?.page ?? 1)}
          onLink={setInvitation}
          onClose={() => setManaged(null)}
        />
      )}
      {selected && (
        <fieldset>
          <legend>
            Assign {selected.givenNames} {selected.familyNames} as director?
          </legend>
          <p>
            This replaces the current director and signs the affected accounts
            out.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void designate();
            }}
          >
            Confirm director assignment
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            Cancel
          </button>
        </fieldset>
      )}
    </section>
  );
}
