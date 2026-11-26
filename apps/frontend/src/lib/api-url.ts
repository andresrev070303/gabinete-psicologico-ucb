export function getApiEndpoint(path: string): URL {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured !== 'string' || !configured.trim()) {
    throw new Error('VITE_API_URL is required.');
  }

  let endpoint: URL;
  try {
    const base = configured.trim();
    if (base.startsWith('//'))
      throw new Error('Protocol-relative URLs are not supported.');
    let end = base.length;
    while (end > 0 && base[end - 1] === '/') end -= 1;
    const normalized = `${base.slice(0, end)}/`;
    const absolute = base.startsWith('/')
      ? new URL(normalized, globalThis.location.origin)
      : new URL(normalized);
    endpoint = new URL(path, absolute);
  } catch {
    throw new Error('VITE_API_URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('VITE_API_URL must use HTTP or HTTPS.');
  }
  return endpoint;
}
