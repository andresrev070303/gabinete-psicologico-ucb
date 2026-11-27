import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import App from './App.tsx';
import { captureActivationToken } from './features/accounts/activation-link';

const activationToken = captureActivationToken();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App activationToken={activationToken} />
  </StrictMode>,
);
