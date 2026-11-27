import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { listAccounts, inviteDirector, assignDirector } from './accounts.api';
import { inviteOperational } from './account-lifecycle.api';
import { OperationalRoleFields } from './OperationalRoleFields';
import { selectedRoles } from './operational-roles';
import { InvitationResult } from './InvitationResult';
import { AccountEditor } from './AccountEditor';
import {
  getAccountStatusLabel,
  getRoleSummary,
  getUserError,
} from '../../lib/presentation';
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
  const fail = (failure: unknown) => setError(getUserError(failure));
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
          setError(getUserError(failure));
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
      <h2 id="accounts-title">Usuarios</h2>
      {error && <p role="alert">{error}</p>}
      {canInvite && (
        <form
          aria-label={
            canInviteOperational
              ? 'Invitar cuenta del equipo'
              : 'Invitar candidato a Director'
          }
          onSubmit={(event) => {
            void invite(event);
          }}
        >
          <h3>
            {canInviteOperational
              ? 'Invitar a una persona al equipo'
              : 'Invitar a un candidato a Director'}
          </h3>
          <label>
            Nombres
            <input
              name="givenNames"
              autoComplete="off"
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Apellidos
            <input
              name="familyNames"
              autoComplete="off"
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Correo electrónico
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
            Crear invitación
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
        Actualizar cuentas
      </button>
      <div className="accounts-table">
        <table>
          <caption>Cuentas disponibles para tu perfil</caption>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo electrónico</th>
              <th>Estado</th>
              <th>Perfiles</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {accounts?.items.map((account) => (
              <tr key={account.accountId}>
                <td>
                  {account.givenNames} {account.familyNames}
                </td>
                <td>{account.email}</td>
                <td>
                  <span
                    className={`account-status account-status--${account.status}`}
                  >
                    {getAccountStatusLabel(account.status)}
                  </span>
                </td>
                <td>{getRoleSummary(account.roles)}</td>
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
                      Gestionar cuenta
                    </button>
                  )}
                  {canAssign && account.canAssignDirector && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSelected(account)}
                    >
                      Designar Director
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {accounts && accounts.total === 0 && (
        <p>No hay cuentas disponibles para tu perfil.</p>
      )}
      {accounts && (
        <nav aria-label="Páginas de cuentas">
          <button
            type="button"
            disabled={busy || accounts.page === 1}
            onClick={() => {
              void load(accounts.page - 1);
            }}
          >
            Anterior
          </button>
          <span>Página {accounts.page}</span>
          <button
            type="button"
            disabled={
              busy || accounts.page * accounts.pageSize >= accounts.total
            }
            onClick={() => {
              void load(accounts.page + 1);
            }}
          >
            Siguiente
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
            ¿Designar a {selected.givenNames} {selected.familyNames} como
            Director?
          </legend>
          <p>
            Esta acción reemplaza al Director actual y cierra las sesiones de
            las cuentas afectadas.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void designate();
            }}
          >
            Confirmar designación del Director
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            Cancelar
          </button>
        </fieldset>
      )}
    </section>
  );
}
