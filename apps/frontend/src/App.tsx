import { useState } from 'react';
import { AccessLayout } from './components/AccessLayout';
import { AuthenticationPanel } from './features/auth/AuthenticationPanel';
import { ActivationPanel } from './features/accounts/ActivationPanel';
import { Workspace } from './features/workspace/Workspace';
import './styles/layout.css';
import './styles/practicum.css';

export default function App({
  activationToken = null,
}: {
  activationToken?: string | null;
}) {
  const [token, setToken] = useState(activationToken);
  if (token !== null)
    return (
      <AccessLayout>
        <ActivationPanel token={token} onComplete={() => setToken(null)} />
      </AccessLayout>
    );
  return (
    <AuthenticationPanel>
      {(context) => <Workspace {...context} />}
    </AuthenticationPanel>
  );
}
