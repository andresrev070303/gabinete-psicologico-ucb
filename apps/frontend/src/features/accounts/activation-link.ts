/** Read once before React mounts, so StrictMode cannot discard the token. */
export function captureActivationToken(
  location: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get('activate');
  if (token === null) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return token.length <= 128 ? token : '';
}
