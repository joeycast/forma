import { parseDocument, serializeDocument, type Diagram } from '../../../packages/core/src';

export type DraftRecord = {
  scope: string;
  identity: string;
  document: string;
  baseRevision: string | null;
  generation: number;
  writerId: string;
  updatedAt: string;
  storageKey?: string;
};

export type UnnamedDraftSnapshot = {
  identity: string;
  doc: Diagram;
  title: string;
  updatedAt: string;
  baseRevision: string | null;
};
export type UnnamedDraftList = {
  items: UnnamedDraftSnapshot[];
  storageAvailable: boolean;
  skippedInvalid: number;
};

const prefix = (scope: string, identity?: string) =>
  `forma.draft.v2.${encodeURIComponent(scope)}.${identity === undefined ? '' : `${encodeURIComponent(identity)}.`}`;
const sessionPrefix = (scope: string) => `forma.draft.session.${encodeURIComponent(scope)}.`;
const leasePrefix = (scope: string) => `forma.draft.lease.${encodeURIComponent(scope)}.`;
const aliasKey = (scope: string) => `forma.draft.aliases.${encodeURIComponent(scope)}`;
const dismissalKey = (scope: string, record: DraftRecord) =>
  `${sessionPrefix(scope)}dismissed.${encodeURIComponent(record.identity)}.${encodeURIComponent(record.writerId)}.${record.generation}`;
const randomId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
function isDismissed(scope: string, record: DraftRecord) {
  try {
    return sessionStorage.getItem(dismissalKey(scope, record)) === '1';
  } catch {
    return false;
  }
}

function sessionValue(key: string, create: () => string) {
  try {
    const prior = sessionStorage.getItem(key);
    if (prior) return prior;
    const next = create();
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return create();
  }
}

export function activeDraftId(scope: string) {
  return sessionValue(`${sessionPrefix(scope)}active`, randomId);
}

export function draftTabId(scope: string) {
  return sessionValue(`${sessionPrefix(scope)}tab`, randomId);
}

export function rotateDraftId(scope: string) {
  const id = randomId();
  try {
    sessionStorage.setItem(`${sessionPrefix(scope)}active`, id);
  } catch {
    /* Current page still gets an isolated ID when session storage is unavailable. */
  }
  return id;
}

export function libraryDraftIdentity(workspace: string, path: string) {
  return `library:${workspace}:${path}`;
}

export function linkDraftIdentity(scope: string, from: string, to: string) {
  if (from === to) return;
  try {
    const aliases = JSON.parse(localStorage.getItem(aliasKey(scope)) ?? '{}') as Record<
      string,
      string
    >;
    aliases[from] = to;
    localStorage.setItem(aliasKey(scope), JSON.stringify(aliases));
  } catch {
    /* Existing drafts remain discoverable by their original identity. */
  }
}

export function dismissRecoverableDraft(scope: string, record: DraftRecord) {
  try {
    sessionStorage.setItem(dismissalKey(scope, record), '1');
  } catch {
    /* Dismissal is per-tab best effort when session storage is unavailable. */
  }
  const keyPrefix = prefix(scope, record.identity);
  const suffix = record.storageKey?.slice(keyPrefix.length) ?? '';
  if (suffix.endsWith(`.${draftTabId(scope)}`)) removeDraft(scope, record);
}

export function historyWithRecoveredDocument(current: Diagram, recovered: Diagram, revision = 0) {
  return {
    revision: revision + 1,
    past: [parseDocument(current)],
    current: parseDocument(recovered),
    future: [] as Diagram[],
  };
}

function resolvesTo(aliases: Record<string, string>, from: string, to: string) {
  const visited = new Set<string>();
  let current = from;
  while (aliases[current] && !visited.has(current)) {
    visited.add(current);
    current = aliases[current];
  }
  return current === to;
}

export function readDrafts(scope: string, identity: string): DraftRecord[] {
  const scopeKeyPrefix = prefix(scope);
  const result: DraftRecord[] = [];
  try {
    const aliases = JSON.parse(localStorage.getItem(aliasKey(scope)) ?? '{}') as Record<
      string,
      string
    >;
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(scopeKeyPrefix)) continue;
      try {
        const record = JSON.parse(localStorage.getItem(key) ?? '') as DraftRecord;
        if (
          record.scope === scope &&
          (record.identity === identity || resolvesTo(aliases, record.identity, identity)) &&
          !isDismissed(scope, record)
        )
          result.push({ ...record, storageKey: key });
      } catch {
        /* Ignore malformed draft records; the native file remains available. */
      }
    }
  } catch {
    return [];
  }
  result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active: DraftRecord[] = [];
  const idle: DraftRecord[] = [];
  const now = Date.now();
  for (const record of result) {
    const suffix = record.storageKey?.slice(prefix(scope, record.identity).length) ?? '';
    const leaseKey = `${leasePrefix(scope)}${suffix}`;
    const lease = Number(localStorage.getItem(leaseKey) ?? 0);
    if (now - lease < 30 * 24 * 60 * 60 * 1000) active.push(record);
    else idle.push(record);
  }
  for (const stale of idle.slice(6))
    if (stale.storageKey) localStorage.removeItem(stale.storageKey);
  for (const record of [...active, ...idle.slice(0, 6)]) {
    const suffix = record.storageKey?.slice(prefix(scope, record.identity).length) ?? '';
    if (suffix) {
      const leaseKey = `${leasePrefix(scope)}${suffix}`;
      const lease = Number(localStorage.getItem(leaseKey) ?? 0);
      if (lease && now - lease >= 30 * 24 * 60 * 60 * 1000) localStorage.removeItem(leaseKey);
    }
  }
  return [...active, ...idle.slice(0, 6)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readValidDrafts(scope: string, identity: string) {
  return readDrafts(scope, identity).flatMap((record) => {
    try {
      return [{ record, doc: parseDocument(JSON.parse(record.document)) }];
    } catch {
      return [];
    }
  });
}

export function listUnnamedDraftSnapshots(
  scope: string,
  currentIdentity: string,
  limit = 20,
): UnnamedDraftList {
  const byIdentity = new Map<
    string,
    { item: UnnamedDraftSnapshot; writerId: string; key: string }
  >();
  const scopePrefix = prefix(scope);
  let storageAvailable = true;
  let skippedInvalid = 0;
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(scopePrefix)) continue;
      try {
        const record = JSON.parse(localStorage.getItem(key) ?? '') as DraftRecord;
        if (
          record.scope !== scope ||
          typeof record.identity !== 'string' ||
          typeof record.writerId !== 'string' ||
          typeof record.updatedAt !== 'string' ||
          !Number.isFinite(Date.parse(record.updatedAt)) ||
          typeof record.document !== 'string'
        ) {
          skippedInvalid++;
          continue;
        }
        if (
          !record.identity.startsWith('draft:') ||
          record.identity === currentIdentity ||
          isDismissed(scope, record)
        )
          continue;
        const doc = parseDocument(JSON.parse(record.document));
        const candidate = {
          identity: record.identity,
          doc,
          title: doc.title,
          updatedAt: record.updatedAt,
          baseRevision: record.baseRevision ?? null,
        };
        const previous = byIdentity.get(record.identity);
        if (
          !previous ||
          candidate.updatedAt > previous.item.updatedAt ||
          (candidate.updatedAt === previous.item.updatedAt &&
            (record.writerId.localeCompare(previous.writerId) || key.localeCompare(previous.key)) >
              0)
        )
          byIdentity.set(record.identity, { item: candidate, writerId: record.writerId, key });
      } catch {
        /* A malformed candidate stays untouched and is omitted from recovery. */
        skippedInvalid++;
      }
    }
  } catch {
    storageAvailable = false;
  }
  return {
    items: [...byIdentity.values()]
      .map(({ item }) => item)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(0, limit)),
    storageAvailable,
    skippedInvalid,
  };
}

export function findRecoverableDraft(
  scope: string,
  identity: string,
  current: Diagram,
  revision: string | null,
) {
  const currentText = serializeDocument(parseDocument(current));
  for (const { record, doc } of readValidDrafts(scope, identity)) {
    if (serializeDocument(doc) === currentText) continue;
    return { record, doc, stale: record.baseRevision !== revision };
  }
  return null;
}

export function readLegacyDraft() {
  try {
    if (localStorage.getItem('forma.document.v1.migrated')) return null;
    const legacy = localStorage.getItem('forma.document.v1');
    return legacy ? parseDocument(JSON.parse(legacy)) : null;
  } catch {
    return null;
  }
}

export function persistDraft(
  scope: string,
  identity: string,
  document: Diagram,
  baseRevision: string | null,
) {
  const writerId = sessionValue(`${sessionPrefix(scope)}writer`, randomId);
  const tabId = draftTabId(scope);
  const counterKey = `${sessionPrefix(scope)}generation.${encodeURIComponent(identity)}`;
  const generation = Number(sessionValue(counterKey, () => '0')) + 1;
  try {
    sessionStorage.setItem(counterKey, String(generation));
  } catch {
    /* The record's timestamp and page instance still distinguish this write. */
  }
  const record: DraftRecord = {
    scope,
    identity,
    document: serializeDocument(parseDocument(document)),
    baseRevision,
    generation,
    writerId,
    updatedAt: new Date().toISOString(),
  };
  const key = `${prefix(scope, identity)}${writerId}.${tabId}`;
  try {
    localStorage.setItem(key, JSON.stringify(record));
    localStorage.setItem(`${leasePrefix(scope)}${writerId}.${tabId}`, String(Date.now()));
  } catch {
    return { record, key, saved: false };
  }
  try {
    const channel = new BroadcastChannel(`forma-drafts:${encodeURIComponent(scope)}`);
    channel.postMessage({ identity, writerId, tabId, generation, updatedAt: record.updatedAt });
    channel.close();
  } catch {
    /* Storage events in other tabs still announce the write. */
  }
  return { record, key, saved: true };
}

export function removeDraft(scope: string, draft: DraftRecord) {
  if (!draft.storageKey?.startsWith(prefix(scope, draft.identity))) return;
  try {
    localStorage.removeItem(draft.storageKey);
    localStorage.removeItem(
      `${leasePrefix(scope)}${draft.storageKey.slice(prefix(scope, draft.identity).length)}`,
    );
  } catch {
    /* Preserve the document if storage is unavailable. */
  }
}

export function clearDraftScope(scope: string) {
  const keyPrefix = prefix(scope);
  const sessionKeyPrefix = sessionPrefix(scope);
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(keyPrefix) || key?.startsWith(leasePrefix(scope)))
        localStorage.removeItem(key);
    }
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(sessionKeyPrefix)) sessionStorage.removeItem(key);
    }
    localStorage.removeItem(aliasKey(scope));
  } catch {
    /* Sign-out must still complete when browser storage is disabled. */
  }
  try {
    const channel = new BroadcastChannel(`forma-drafts:${encodeURIComponent(scope)}`);
    channel.postMessage({ action: 'clear-account' });
    channel.close();
  } catch {
    /* Other tabs also receive the auth sign-out message. */
  }
}
