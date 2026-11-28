import { getRoleSummary } from '../../lib/presentation';
import { AccountsPanel } from '../accounts/AccountsPanel';
import { IdentityAuditPanel } from '../accounts/IdentityAuditPanel';
import { OwnAccessPanel } from '../accounts/OwnAccessPanel';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { HomePanel } from './HomePanel';
import { ServiceStatusPanel } from './ServiceStatusPanel';
import { UpcomingPanel } from './UpcomingPanel';
import type { NavigationItem, WorkspaceSection } from './navigation';
import {
  canManagePractice,
  canReadOwnPractice,
  canReadSupervisedPractice,
} from '../practicum/practicum-access';
import { PracticumManagementPanel } from '../practicum/PracticumManagementPanel';
import { PracticumPersonalPanel } from '../practicum/PracticumPersonalPanel';
import { InstitutionalPanel } from '../institutional/InstitutionalPanel';
import { canReadInstitutional } from '../institutional/institutional-access';
import type { RecordKey } from '../institutional/institutional.types';
import { AgendaCalendar } from '../agenda/AgendaCalendar';

type WorkspaceContentProps = Readonly<{
  identity: AuthenticatedIdentity['identity'];
  current: NavigationItem;
  items: readonly NavigationItem[];
  initials: string;
  onNavigate: (section: WorkspaceSection) => void;
  onSessionEnded: () => void;
  institutionalTarget?: RecordKey | null;
  institutionalRequest?: number;
}>;

export function WorkspaceContent({
  identity,
  current,
  items,
  initials,
  onNavigate,
  onSessionEnded,
  institutionalTarget,
  institutionalRequest,
}: WorkspaceContentProps) {
  switch (current.id) {
    case 'agenda':
      return <AgendaCalendar />;
    case 'institutional':
      if (canReadInstitutional(identity))
        return (
          <InstitutionalPanel
            key={`${identity.accountId}:${institutionalTarget?.kind ?? ''}:${institutionalTarget?.id ?? ''}:${institutionalRequest ?? 0}`}
            identity={identity}
            initialRecord={institutionalTarget}
          />
        );
      break;
    case 'practicum':
      if (canManagePractice(identity) || canReadSupervisedPractice(identity))
        return <PracticumManagementPanel identity={identity} />;
      break;
    case 'tasks':
    case 'hours':
    case 'my-practice':
      if (canReadOwnPractice(identity))
        return (
          <PracticumPersonalPanel
            key={current.id}
            identity={identity}
            view={current.id === 'my-practice' ? 'summary' : current.id}
          />
        );
      break;
    case 'home':
      return (
        <HomePanel
          givenNames={identity.givenNames}
          items={items}
          onNavigate={onNavigate}
        />
      );
    case 'accounts':
      if (identity.permissions.includes('accounts.read'))
        return <AccountsPanel key={identity.accountId} identity={identity} />;
      break;
    case 'audit':
      if (identity.permissions.includes('audit.read_identity'))
        return <IdentityAuditPanel />;
      break;
    case 'profile':
      return (
        <section className="profile-panel surface-panel">
          <div className="profile-summary">
            <span className="user-avatar user-avatar--large" aria-hidden="true">
              {initials}
            </span>
            <div>
              <h2>
                {identity.givenNames} {identity.familyNames}
              </h2>
              <p>{identity.email}</p>
              <span className="role-badge">
                {getRoleSummary(identity.roles)}
              </span>
            </div>
          </div>
          <OwnAccessPanel onSessionEnded={onSessionEnded} />
        </section>
      );
    case 'system':
      if (identity.roles.includes('administrator'))
        return <ServiceStatusPanel />;
      break;
  }
  return <UpcomingPanel item={current} onReturn={() => onNavigate('home')} />;
}
