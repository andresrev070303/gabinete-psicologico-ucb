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
import { getUserError } from '../../lib/presentation';

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
      if (!controller.signal.aborted) setError(getUserError(failure));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const operational = account.managementKind === 'operational';
  return (
    <section aria-label={`Gestionar ${account.email}`} aria-busy={busy}>
      <h3>Gestionar {account.email}</h3>
      {error && <p role="alert">{error}</p>}
      {operational && permitted('accounts.update_operational') && (
        <form
          aria-label="Editar datos de la cuenta"
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
            Nombres
            <input
              name="givenNames"
              defaultValue={account.givenNames}
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Apellidos
            <input
              name="familyNames"
              defaultValue={account.familyNames}
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
          <label>
            Teléfono de contacto
            <input
              name="contactPhone"
              type="tel"
              defaultValue={account.contactPhone ?? ''}
              maxLength={50}
              disabled={busy}
            />
          </label>
          <button disabled={busy}>Guardar datos</button>
        </form>
      )}
      {operational &&
        account.status !== 'disabled' &&
        permitted('roles.assign_operational') &&
        permitted('roles.revoke_operational') && (
          <form
            aria-label="Cambiar perfiles operativos"
            onSubmit={(event) => {
              void submit(event, (data, signal) =>
                changeRoles(account.accountId, selectedRoles(data), signal),
              );
            }}
          >
            <OperationalRoleFields roles={account.roles} disabled={busy} />
            <p>
              Cambiar los perfiles cierra las sesiones de esta cuenta. Una
              selección vacía revoca todos sus perfiles operativos.
            </p>
            <button disabled={busy}>Guardar perfiles</button>
          </form>
        )}
      {account.status !== 'disabled' &&
        permitted(
          operational ? 'accounts.disable_operational' : 'director.disable',
        ) && (
          <form
            aria-label="Desactivar cuenta"
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
              Motivo de desactivación
              <input
                name="reason"
                minLength={5}
                maxLength={240}
                required
                disabled={busy}
              />
            </label>
            <label>
              <input type="checkbox" required disabled={busy} />
              Confirmo la desactivación de esta cuenta y la revocación de sus
              accesos.
            </label>
            <button disabled={busy}>Desactivar cuenta</button>
          </form>
        )}
      {account.status !== 'active' &&
        permitted(
          operational ? 'accounts.reinvite_operational' : 'director.reinvite',
        ) && (
          <form
            aria-label="Volver a invitar"
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
              El nuevo enlace reemplaza las invitaciones anteriores. Los accesos
              revocados no se restablecen automáticamente.
            </p>
            <button disabled={busy}>Crear nueva invitación</button>
          </form>
        )}
      {account.status === 'active' &&
        permitted(
          operational
            ? 'credentials.issue_operational_reset'
            : 'credentials.issue_director_reset',
        ) && (
          <form
            aria-label="Emitir recuperación de contraseña"
            onSubmit={(event) => {
              void submit(event, (_data, signal) =>
                issuePasswordReset(account.accountId, signal),
              );
            }}
          >
            <label>
              <input type="checkbox" required disabled={busy} />
              Confirmo la emisión de un enlace privado de recuperación. Las
              sesiones se cerrarán al restablecer la contraseña.
            </label>
            <button disabled={busy}>Emitir enlace de recuperación</button>
          </form>
        )}
      <button type="button" onClick={onClose} disabled={busy}>
        Cerrar edición de cuenta
      </button>
    </section>
  );
}
