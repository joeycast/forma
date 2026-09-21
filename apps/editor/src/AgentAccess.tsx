import { useEffect, useState } from 'react';

type Token = {
  id: string;
  name: string;
  permission: 'read' | 'write';
  folder: string;
  created: number;
  expires: number;
};

async function api(path: string, body?: unknown) {
  const res = await fetch('/api/' + path, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forma-Request': '1' },
          body: JSON.stringify(body),
        }),
    cache: 'no-store',
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error ?? 'Request failed.');
  return value;
}

export function AgentAccess() {
  const [tokens, setTokens] = useState<Token[]>([]),
    [mcp, setMcp] = useState(false),
    [name, setName] = useState('My diagram agent'),
    [folder, setFolder] = useState(''),
    [permission, setPermission] = useState<'read' | 'write'>('read'),
    [days, setDays] = useState('30'),
    [secret, setSecret] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revoke, setRevoke] = useState<string | null>(null),
    [copied, setCopied] = useState(false);
  const refresh = async () => {
    const result = await api('tokens');
    setTokens(result.tokens);
    setMcp(result.mcp);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h2 id="modal-title">Connect your agent</h2>
      <p>
        Give an agent access to your diagrams without sharing your Google login. Tokens can only
        access your private library.
      </p>
      {secret ? (
        <div className="token-reveal">
          <strong>Copy your token now</strong>
          <p>
            This is the only time the full token is shown. Store it in your agent’s secret settings
            or a private file. Keep it out of Git and prompts.
          </p>
          <textarea aria-label="New agent token" readOnly value={secret} rows={3} />
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => {
                setSecret('');
                setCopied(false);
              }}
            >
              I’ve stored it
            </button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                } catch {
                  setError('Select and copy the token manually.');
                }
              }}
            >
              {copied ? 'Token copied' : 'Copy token'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="design-fields">
            <label className="field">
              Token name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
            <label className="field">
              Access
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
              >
                <option value="read">Read only</option>
                <option value="write">Read and write</option>
              </select>
            </label>
            <label className="field">
              Expires in
              <select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </label>
          </div>
          <label className="field">
            Allowed folder
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="engineering/platform (leave blank for all your diagrams)"
            />
          </label>
          <p className="help-text">
            Subfolders are included. Blank means your whole library. Write access can create and
            update diagrams, with conflict checks.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const created = await api('tokens', {
                  name,
                  permission,
                  folder,
                  days: Number(days),
                });
                setSecret(created.token);
                setCopied(false);
                await refresh();
              })
            }
          >
            Create token
          </button>
        </>
      )}
      <h3 className="access-heading">Your connections</h3>
      <div className="token-list">
        {tokens.length ? (
          tokens.map((t) => (
            <div key={t.id} className="token-row">
              <div>
                <strong>{t.name}</strong>
                <span>
                  {t.permission === 'read' ? 'Read only' : 'Read and write'} ·{' '}
                  {t.folder || 'All your diagrams'} ·{' '}
                  {t.expires <= Date.now()
                    ? 'Expired'
                    : 'Expires ' + new Date(t.expires).toLocaleDateString()}
                </span>
              </div>
              {revoke === t.id ? (
                <>
                  <button className="secondary" disabled={busy} onClick={() => setRevoke(null)}>
                    Cancel
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api('tokens/revoke', { id: t.id });
                        setRevoke(null);
                        setSecret('');
                        await refresh();
                      })
                    }
                  >
                    Confirm revoke
                  </button>
                </>
              ) : (
                <button className="secondary" disabled={busy} onClick={() => setRevoke(t.id)}>
                  Revoke
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="help-text">No agent tokens yet.</p>
        )}
      </div>
      <details className="agent-connection-help">
        <summary>CLI and MCP connection instructions</summary>
        <p>
          Set <code>FORMA_REMOTE_URL</code> to <code>{location.origin}</code>. Put the token in a
          private file and set <code>FORMA_AGENT_TOKEN_FILE</code> to its path, or use{' '}
          <code>FORMA_AGENT_TOKEN</code> in your agent’s secret environment.
        </p>
        <pre>
          {`forma remote list
forma remote pull engineering/platform.forma.json --output platform.forma.json
forma remote push platform.forma.json`}
        </pre>
        <p>
          For any MCP client that can run a local command, use <code>forma mcp</code> with the same
          environment.{' '}
          {mcp ? (
            <>
              For remote Streamable HTTP clients, connect to <code>{location.origin}/mcp</code> and
              supply the token as an Authorization Bearer header.
            </>
          ) : (
            <>
              The administrator hasn’t enabled the HTTP MCP endpoint; the stdio bridge still works.
            </>
          )}
        </p>
        <p className="help-text">
          This release uses manually configured bearer tokens, not MCP OAuth discovery. Use the
          stdio bridge if your client cannot configure HTTP headers. Revoke a token here to block
          new operations immediately.
        </p>
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
