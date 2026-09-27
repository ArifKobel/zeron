export function edgeSocketUrl(edgeUrl: string, path: string, params: Record<string, string>): string {
  const url = new URL(path, edgeUrl.endsWith('/') ? edgeUrl : `${edgeUrl}/`);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
