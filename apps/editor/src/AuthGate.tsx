import { useEffect, useState } from 'react';
import { App } from './App';
import { hosted } from './hosting';
export type Account = { name: string; email: string };
export function AuthGate() {
  const [account, setAccount] = useState<Account | null>(null),
    [loading, setLoading] = useState(hosted),
    [error, setError] = useState('');
  useEffect(() => {
    if (!hosted) return;
    let live = true;
    const channel = new BroadcastChannel('forma-auth');
    channel.onmessage = (event) => {
      if (event.data === 'signed-out') {
        live = false;
        setAccount(null);
        setLoading(false);
      }
    };
    fetch('/api/session', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('The workspace is unavailable. Try again shortly.');
        return response.json();
      })
      .then((data) => {
        if (live) setAccount(data.user);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener('pageshow', restore);
    return () => {
      live = false;
      channel.close();
      window.removeEventListener('pageshow', restore);
    };
  }, []);
  if (!hosted) return <App />;
  if (account) return <App account={account} />;
  const reason = new URLSearchParams(location.search).get('authError');
  const messages: Record<string, string> = {
    expired: 'This sign-in attempt expired. Please try again.',
    cancelled: 'Sign-in was cancelled. Your files are unchanged.',
    failed: 'Google sign-in could not be verified. Please try again.',
    denied: 'This account is not allowed in this workspace. Contact your administrator.',
  };
  return (
    <main className="signin-page">
      <div className="signin-brand">
        <span className="brand-mark">
          <i />
          <i />
          <i />
        </span>
        forma<span>FOR TEAMS</span>
      </div>
      <section className="signin-card">
        <div className="signin-kicker">YOUR ORGANIZATION’S WORKSPACE</div>
        <h1>
          Good ideas deserve
          <br />a clear picture.
        </h1>
        <p>
          Create with your agent. Refine together.
          <br />
          Keep your diagrams on your organization’s server.
        </p>
        <div className="signin-divider" />
        {loading ? (
          <p role="status">Connecting to your workspace…</p>
        ) : error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={() => location.reload()}>
              Try again
            </button>
          </>
        ) : (
          <>
            <a className="google-signin" href="/auth/login">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.6h3.4c2-1.8 2.8-4.4 2.8-7.6Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 5-.9 6.8-2.5l-3.4-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z"
                />
                <path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.5H3a10 10 0 0 0 0 9l3.4-2.7Z" />
                <path
                  fill="#EA4335"
                  d="M12 6.1c1.5 0 2.8.5 3.8 1.5L18.7 5A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7A6 6 0 0 1 12 6.1Z"
                />
              </svg>
              Sign in with Google
            </a>
            {reason && messages[reason] && (
              <p className="signin-error" role="alert">
                {messages[reason]}
              </p>
            )}
            <small>Use an account approved by your administrator.</small>
          </>
        )}
      </section>
      <footer>Private libraries · Open format · Hosted by your organization</footer>
    </main>
  );
}
