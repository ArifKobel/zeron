import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, authorizeUrl, beginSignIn, codeFromPaste, jwtExpiry, type ServerConfig } from '@/edge/account';

const config: ServerConfig = {
  edgeUrl: 'https://edge.zeron.sh',
  workosClientId: 'client_x',
  workosApiBase: 'https://api.workos.com',
  redirectUri: null,
  showMockHarness: false,
};

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

describe('sign-in', () => {
  beforeEach(() => sessionStorage.clear());

  it("uses the edge's paste-code callback unless a redirect URI is registered", () => {
    const url = new URL(authorizeUrl(config, 'st'));
    expect(url.origin + url.pathname).toBe('https://api.workos.com/user_management/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client_x',
      redirect_uri: 'https://edge.zeron.sh/auth/cli/callback',
      provider: 'authkit',
      state: 'st',
    });
    const own = new URL(authorizeUrl({ ...config, redirectUri: 'https://web.example/auth/callback' }, 'st'));
    expect(own.searchParams.get('redirect_uri')).toBe('https://web.example/auth/callback');
  });

  it('accepts only a pasted code from a sign-in this tab started, once', () => {
    const state = new URL(beginSignIn(config)).searchParams.get('state');
    expect(() => codeFromPaste('other.code')).toThrow(/different sign-in/);
    expect(() => codeFromPaste('no-dot')).toThrow(/contains a dot/);
    expect(codeFromPaste(`  ${state}.the.code  `)).toBe('the.code');
    expect(() => codeFromPaste(`${state}.the.code`)).toThrow(/different sign-in/);
  });

  it('reads JWT expiry, tolerating garbage', () => {
    expect(jwtExpiry(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
    expect(jwtExpiry('not-a-jwt')).toBeNull();
    expect(jwtExpiry(jwt({ sub: 'u' }))).toBeNull();
  });
});

describe('Account', () => {
  it('refreshes once for concurrent callers near expiry', async () => {
    const soon = jwt({ exp: Math.floor(Date.now() / 1000) + 30 });
    const later = jwt({ exp: Math.floor(Date.now() / 1000) + 600 });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: soon, orgId: 'o', user: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: later, orgId: 'o', user: null })));
    vi.stubGlobal('fetch', fetch);
    try {
      const account = new Account();
      await account.restore();
      expect(account.state.status).toBe('signedIn');
      const [a, b] = await Promise.all([account.token(), account.token()]);
      expect(a).toBe(later);
      expect(b).toBe(later);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(await account.token()).toBe(later);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('treats a missing session as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ signedOut: true, accessToken: null }))));
    try {
      const account = new Account();
      expect((await account.restore()).status).toBe('signedOut');
      expect(await account.token()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
