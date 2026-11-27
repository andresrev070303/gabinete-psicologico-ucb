export function getApiEndpoint(path: string): URL {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured !== 'string' || !configured.trim()) {
    throw new Error('Falta configurar VITE_API_URL.');
  }

  let endpoint: URL;
  try {
    const base = configured.trim();
    if (base.startsWith('//'))
      throw new Error('La dirección del servicio debe indicar el protocolo.');
    let end = base.length;
    while (end > 0 && base[end - 1] === '/') end -= 1;
    const normalized = `${base.slice(0, end)}/`;
    const absolute = base.startsWith('/')
      ? new URL(normalized, globalThis.location.origin)
      : new URL(normalized);
    endpoint = new URL(path, absolute);
  } catch {
    throw new Error('VITE_API_URL debe contener una dirección válida.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('VITE_API_URL debe utilizar HTTP o HTTPS.');
  }
  return endpoint;
}
