export interface DatabaseHealth {
  readonly status: 'ok';
  readonly database: 'connected';
}

export type HealthCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DatabaseHealth }
  | { status: 'error'; message: string };