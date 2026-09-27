import { useState } from 'react';
import { beginSignIn, codeFromPaste, type AccountState } from '@/edge/account';
import { ChevronRight } from 'lucide-react';
import { restart, useSession } from '@/session';
import { ZeronMark } from '@/ui/Brand';

export function SignIn() {
  const session = useSession();
  const { config, account } = session;
  const [state, setState] = useState<AccountState>(account.state);
  const [opened, setOpened] = useState(false);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(session.status === 'signIn' ? session.error : null);

  const run = async (action: () => Promise<AccountState>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setState(next);
      if (next.status === 'signedIn') restart();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const url = beginSignIn(config);
    if (config.redirectUri) {
      location.assign(url);
      return;
    }
    window.open(url, '_blank', 'noopener');
    setOpened(true);
  };

  return (
    <div className="signin">
      <div className="signin-card">
        <ZeronMark size={72} className="signin-mark" />
        <h1>Zeron</h1>
        <p className="signin-subtitle">Your coding agents, from anywhere</p>

        {state.status === 'needsOrg' ? (
          <>
            {state.orgs.length === 0 ? (
              <div className="error-text">No organizations for this account</div>
            ) : (
              <div className="org-list">
                <div className="org-title">Choose an organization</div>
                {state.orgs.map((org) => (
                  <button key={org.id} className="org-row" disabled={busy} onClick={() => run(() => account.selectOrg(org.id))}>
                    <span>{org.name}</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            )}
            <button className="link-btn" onClick={() => run(async () => (await account.signOut(), account.state))}>
              Back
            </button>
          </>
        ) : (
          <>
            <button className="primary-capsule" onClick={start} disabled={busy}>
              {busy ? <span className="spinner dark" /> : opened ? 'Open the sign-in page again' : 'Log in to Zeron'}
            </button>
            {opened && (
              <form
                className="paste-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => account.exchange(codeFromPaste(pasted)));
                }}
              >
                <label htmlFor="signin-code">After logging in, copy the code the page shows and paste it here.</label>
                <input
                  id="signin-code"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Paste code"
                />
                <button className="primary-capsule" disabled={!pasted.trim() || busy}>
                  {busy ? 'Signing in…' : 'Continue'}
                </button>
              </form>
            )}
          </>
        )}

        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}
