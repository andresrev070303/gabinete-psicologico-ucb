import { useEffect, useRef, useState } from 'react';
import { getCurrentSession, signIn, signOut } from './auth.api';
import type { AuthenticatedIdentity, SignInInput } from './auth.types';

type AuthenticationState = {
  current: AuthenticatedIdentity | null;
  busy: boolean;
  error: string | null;
};
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Authentication failed. Please try again.';
}

export function useAuthentication() {
  const [state, setState] = useState<AuthenticationState>({
    current: null,
    busy: true,
    error: null,
  });
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    void getCurrentSession(controller.signal).then(
      (current) => {
        if (!controller.signal.aborted)
          setState({ current, busy: false, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({ current: null, busy: false, error: errorMessage(error) });
      },
    );
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, []);

  async function authenticate(input: SignInInput): Promise<void> {
    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ current: null, busy: true, error: null });
    try {
      const current = await signIn(input, controller.signal);
      if (!controller.signal.aborted)
        setState({ current, busy: false, error: null });
    } catch (error) {
      if (!controller.signal.aborted)
        setState({ current: null, busy: false, error: errorMessage(error) });
    }
  }
  async function endSession(): Promise<void> {
    const controller = new AbortController();
    activeRequest.current = controller;
    setState((previous) => ({ ...previous, busy: true, error: null }));
    try {
      await signOut(controller.signal);
      if (!controller.signal.aborted)
        setState({ current: null, busy: false, error: null });
    } catch (error) {
      if (!controller.signal.aborted)
        setState((previous) => ({
          ...previous,
          busy: false,
          error: errorMessage(error),
        }));
    }
  }
  function clearSession() {
    activeRequest.current?.abort();
    setState({ current: null, busy: false, error: null });
  }
  return { state, authenticate, endSession, clearSession };
}
