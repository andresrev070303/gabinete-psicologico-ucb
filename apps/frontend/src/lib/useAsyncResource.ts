import { useCallback, useEffect, useRef, useState } from 'react';
import { getUserError } from './presentation';

export function useAsyncResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const [state, setState] = useState<{
    data: T | null;
    busy: boolean;
    error: string | null;
    receivedAt: number;
  }>({ data: null, busy: enabled, error: null, receivedAt: 0 });
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState((previous) => ({ ...previous, busy: true, error: null }));
    try {
      const data = await loader(controller.signal);
      if (!controller.signal.aborted)
        setState({ data, busy: false, error: null, receivedAt: Date.now() });
    } catch (error) {
      if (!controller.signal.aborted)
        setState((previous) => ({
          ...previous,
          busy: false,
          error: getUserError(error),
        }));
    }
  }, [loader, enabled]);
  useEffect(() => {
    void refresh();
    const focus = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      active.current?.abort();
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  return { ...state, refresh };
}
export function useAsyncMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function run<T>(
    work: (signal: AbortSignal) => Promise<T>,
    onSaved: (value: T) => void | Promise<void>,
  ): Promise<boolean> {
    if (active.current) return false;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await work(controller.signal);
      if (controller.signal.aborted) return false;
      await onSaved(result);
      return true;
    } catch (failure) {
      if (!controller.signal.aborted) setError(getUserError(failure));
      return false;
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        active.current = null;
      }
    }
  }
  return { busy, error, run, clearError: () => setError(null) };
}
