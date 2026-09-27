type Route =
  | { kind: 'home' }
  | { kind: 'space'; spaceId: string }
  | { kind: 'chat'; chatId: string }
  | { kind: 'newSession'; spaceId: string }
  | { kind: 'newProjectless'; deviceId: string | null };

export function parseRoute(hash: string): Route {
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'chat' && parts[1]) return { kind: 'chat', chatId: parts[1] };
  if (parts[0] === 'space' && parts[1]) return { kind: 'space', spaceId: parts[1] };
  if (parts[0] === 'new' && parts[1] === 'space' && parts[2]) return { kind: 'newSession', spaceId: parts[2] };
  if (parts[0] === 'new' && parts[1] === 'device') return { kind: 'newProjectless', deviceId: parts[2] ?? null };
  return { kind: 'home' };
}

export function routePath(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'space':
      return `/space/${encodeURIComponent(route.spaceId)}`;
    case 'chat':
      return `/chat/${encodeURIComponent(route.chatId)}`;
    case 'newSession':
      return `/new/space/${encodeURIComponent(route.spaceId)}`;
    case 'newProjectless':
      return route.deviceId ? `/new/device/${encodeURIComponent(route.deviceId)}` : '/new/device';
  }
}

export function href(route: Route): string {
  return `#${routePath(route)}`;
}

function depth(): number {
  return typeof history.state?.zwDepth === 'number' ? history.state.zwDepth : 0;
}

function announce() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function go(route: Route) {
  const path = href(route);
  if (location.hash === path) return;
  history.pushState({ zwDepth: depth() + 1 }, '', path);
  announce();
}

export function replace(route: Route) {
  history.replaceState({ zwDepth: depth() }, '', href(route));
  announce();
}

export function back() {
  if (depth() > 0) history.back();
  else replace({ kind: 'home' });
}
