import { useEffect, useRef, useState } from 'react';
import { checkDatabaseHealth } from './health.api';
import type { HealthCheckState } from './health.types';

function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'The request timed out. Please try again.';
  }

  if (error instanceof TypeError) {
    return 'The API could not be reached. Check its URL and availability.';
  }

  if (error instanceof SyntaxError) {
    return 'The API did not return valid JSON.';
  }

  return error instanceof Error ? error.message : 'The connection check failed.';
}

export function useHealthCheck() {
  const [state, setState] = useState<HealthCheckState>({ status: 'idle' });
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => activeRequest.current?.abort();
  }, []);

  async function checkConnection() {
    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ status: 'loading' });

    try {
      const data = await checkDatabaseHealth(controller.signal);

      if (!controller.signal.aborted) {
        setState({ status: 'success', data });
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setState({ status: 'error', message: getErrorMessage(error) });
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
    }
  }

  return { state, checkConnection };
}