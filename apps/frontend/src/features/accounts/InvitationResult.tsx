import type { DirectorInvitation } from './accounts.types';
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
        <p>
          Gmail accepted the message for delivery to {invitation.account.email}.
        </p>
      ) : invitation.delivery === 'failed' ? (
        <p>
          The account was saved, but email delivery could not be confirmed.
          Check sender authorization and issue a new invitation or recovery
          link.
        </p>
      ) : (
        <p>Deliver this private, one-use link to {invitation.account.email}.</p>
      )}
      <p>Expires: {new Date(invitation.expiresAt).toLocaleString()}.</p>
      {link && (
        <>
          <p>This manual test link is shown only in this response.</p>
          <label>
            Activation link
            <input readOnly value={link} />
          </label>
          <a href={link} target="_blank" rel="noopener noreferrer">
            Open activation page
          </a>
        </>
      )}
      <button type="button" onClick={onDismiss}>
        {link ? 'Dismiss link' : 'Dismiss message'}
      </button>
    </div>
  );
}
