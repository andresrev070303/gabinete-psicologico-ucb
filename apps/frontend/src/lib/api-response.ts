import { apiRequest } from './api-client';
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const isNullableText = (value: unknown) =>
  value === null || typeof value === 'string';
export async function requestJson<T>(
  path: string,
  signal: AbortSignal,
  guard: (value: unknown) => value is T,
  options: {
    method?: string;
    input?: unknown;
    messages?: Readonly<Record<string, string>>;
  } = {},
): Promise<T> {
  const response = await apiRequest(
    path,
    {
      method: options.method ?? 'GET',
      body:
        options.input === undefined ? undefined : JSON.stringify(options.input),
    },
    signal,
  );
  const body: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Tu sesión venció. Ingresa nuevamente para continuar.');
    const code =
      isRecord(body) && typeof body.code === 'string' ? body.code : '';
    throw new Error(
      options.messages && Object.hasOwn(options.messages, code)
        ? options.messages[code]
        : response.status === 403
          ? 'Tu cuenta no tiene permiso para realizar esta operación.'
          : response.status === 404
            ? 'El registro ya no está disponible para tu cuenta.'
            : 'No pudimos completar la operación. Intenta nuevamente.',
    );
  }
  if (!guard(body))
    throw new Error(
      'El servicio devolvió datos inesperados. Actualiza la página.',
    );
  return body;
}
