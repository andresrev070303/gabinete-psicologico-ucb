import type { DirectorInvitation } from './accounts.types';
import { formatDateTime } from '../../lib/presentation';
export function InvitationResult({
  invitation,
  onDismiss,
}: {
  invitation: DirectorInvitation;
  onDismiss: () => void;
}) {
  const link = invitation.activationToken
    ? `${location.origin}${location.pathname}#activate=${encodeURIComponent(invitation.activationToken)}`
    : null;
  return (
    <div className="invitation-result" role="status">
      {invitation.delivery === 'sent' ? (
        <p>Gmail aceptó el envío del mensaje a {invitation.account.email}.</p>
      ) : invitation.delivery === 'failed' ? (
        <p>
          La cuenta quedó guardada, pero no pudimos confirmar el envío del
          correo. Revisa la configuración del remitente y emite una nueva
          invitación o recuperación.
        </p>
      ) : (
        <p>
          Entrega este enlace privado de un solo uso a{' '}
          {invitation.account.email}.
        </p>
      )}
      <p>Vence: {formatDateTime(invitation.expiresAt)}.</p>
      {link && (
        <>
          <p>
            Este enlace de prueba manual se muestra únicamente en esta
            respuesta.
          </p>
          <label>
            Enlace de activación
            <input readOnly value={link} />
          </label>
          <a href={link} target="_blank" rel="noopener noreferrer">
            Abrir página de activación
          </a>
        </>
      )}
      <button type="button" onClick={onDismiss}>
        {link ? 'Ocultar enlace' : 'Cerrar mensaje'}
      </button>
    </div>
  );
}
