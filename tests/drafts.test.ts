import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../packages/core/src';
import {
  clearDraftScope,
  dismissRecoverableDraft,
  findRecoverableDraft,
  historyWithRecoveredDocument,
  listUnnamedDraftSnapshots,
  persistDraft,
  linkDraftIdentity,
  readLegacyDraft,
  readDrafts,
  readValidDrafts,
  removeDraft,
} from '../apps/editor/src/drafts';

class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });

const doc = (title: string) => parseDocument({ version: 2, title, nodes: [], edges: [] });

test('drafts are isolated by account, bounded to a tab key, and only the selected candidate is discarded', () => {
  const first = persistDraft('account:a', 'library:w:one.forma.json', doc('First'), 'rev-1');
  const updated = persistDraft('account:a', 'library:w:one.forma.json', doc('Updated'), 'rev-1');
  assert.equal(first.key, updated.key);
  const otherTab = session.getItem('forma.draft.session.account%3Aa.tab');
  session.clear();
  persistDraft('account:a', 'library:w:one.forma.json', doc('Other tab'), 'rev-1');
  assert.notEqual(session.getItem('forma.draft.session.account%3Aa.tab'), otherTab);
  persistDraft('account:b', 'library:w:one.forma.json', doc('Private'), 'rev-1');
  const candidates = readDrafts('account:a', 'library:w:one.forma.json');
  assert.equal(candidates.length, 2);
  removeDraft('account:a', candidates[0]);
  assert.equal(readDrafts('account:a', 'library:w:one.forma.json').length, 1);
  assert.equal(readDrafts('account:b', 'library:w:one.forma.json').length, 1);
  clearDraftScope('account:a');
  assert.equal(readDrafts('account:a', 'library:w:one.forma.json').length, 0);
  assert.equal(readDrafts('account:b', 'library:w:one.forma.json').length, 1);
});

test('keeping another active tab draft dismisses it only for this tab and preserves its bytes', () => {
  const identity = 'library:w:shared.forma.json';
  const otherTab = persistDraft('account:shared', identity, doc('Other tab work'), 'rev-1');
  session.clear();
  const currentTab = persistDraft('account:shared', identity, doc('Current tab work'), 'rev-1');
  const candidate = readDrafts('account:shared', identity).find(
    (record) => record.writerId === otherTab.record.writerId,
  );
  assert.ok(candidate);
  dismissRecoverableDraft('account:shared', candidate);
  assert.ok(local.getItem(otherTab.key));
  assert.ok(
    readDrafts('account:shared', identity).some(
      (record) => record.writerId === currentTab.record.writerId,
    ),
  );
  assert.ok(
    !readDrafts('account:shared', identity).some(
      (record) => record.writerId === otherTab.record.writerId,
    ),
  );
});

test('discarding this tab draft removes only its record, and recovered history remains undoable', () => {
  const identity = 'library:w:own.forma.json';
  session.clear();
  const ownTab = persistDraft('account:own', identity, doc('Own work'), 'rev-1');
  const ownRecord = readDrafts('account:own', identity).find(
    (record) => record.writerId === ownTab.record.writerId,
  );
  assert.ok(ownRecord);
  dismissRecoverableDraft('account:own', ownRecord);
  assert.equal(local.getItem(ownTab.key), null);

  const recovered = historyWithRecoveredDocument(doc('Server version'), doc('Unsaved local'), 4);
  assert.equal(recovered.revision, 5);
  assert.equal(recovered.past[0].title, 'Server version');
  assert.equal(recovered.current.title, 'Unsaved local');
});

test('draft retention never prunes active writers and bounds expired snapshots', () => {
  const identity = 'library:w:retained.forma.json';
  for (let index = 0; index < 10; index++) {
    session.clear();
    persistDraft('account:retention', identity, doc(`Tab ${index}`), 'rev-1');
  }
  assert.equal(readDrafts('account:retention', identity).length, 10);
  for (const record of readDrafts('account:retention', identity)) {
    const suffix = record.storageKey!.split('.').slice(-2).join('.');
    local.setItem(`forma.draft.lease.account%3Aretention.${suffix}`, '1');
  }
  assert.equal(readDrafts('account:retention', identity).length, 6);
});

test('draft validation skips a malformed newest record and falls back to a valid older snapshot', () => {
  const identity = 'library:w:corrupt.forma.json';
  persistDraft('account:valid', identity, doc('Older valid'), 'rev-old');
  session.clear();
  const bad = persistDraft('account:valid', identity, doc('Newer malformed'), 'rev-new');
  local.setItem(
    bad.key,
    JSON.stringify({
      ...bad.record,
      document: '{ definitely not a diagram',
      updatedAt: '9999-12-31T00:00:00.000Z',
    }),
  );
  const candidates = readValidDrafts('account:valid', identity);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].doc.title, 'Older valid');
  assert.equal(candidates[0].record.baseRevision, 'rev-old');
});

test('draft recovery retains snapshots based on an older library revision', () => {
  const identity = 'library:w:stale.forma.json';
  const saved = persistDraft('account:stale', identity, doc('Stale local'), 'rev-1');
  const candidate = findRecoverableDraft('account:stale', identity, doc('Server newest'), 'rev-2');
  assert.equal(candidate?.record.baseRevision, 'rev-1');
  assert.equal(candidate?.doc.title, 'Stale local');
  assert.equal(candidate?.stale, true);
  assert.ok(saved.saved);
});

test('unnamed recovery lists only valid same-scope inactive identities and the newest snapshot per identity', () => {
  const scope = 'account:recover-list';
  persistDraft(scope, 'draft:current', doc('Current tab'), null);
  session.clear();
  const older = persistDraft(scope, 'draft:other-tab', doc('Older copy'), null);
  session.clear();
  const newer = persistDraft(scope, 'draft:other-tab', doc('Newest copy'), null);
  local.setItem(
    older.key,
    JSON.stringify({ ...older.record, updatedAt: '2025-01-01T00:00:00.000Z' }),
  );
  local.setItem(
    newer.key,
    JSON.stringify({ ...newer.record, updatedAt: '2025-02-01T00:00:00.000Z' }),
  );
  session.clear();
  const malformed = persistDraft(scope, 'draft:corrupt', doc('Corrupt'), null);
  local.setItem(malformed.key, JSON.stringify({ ...malformed.record, document: '{bad json' }));
  persistDraft('account:another', 'draft:private', doc('Private account'), null);
  persistDraft(scope, 'library:workspace:named.forma.json', doc('Named file'), 'revision-1');

  const list = listUnnamedDraftSnapshots(scope, 'draft:current');
  assert.equal(list.storageAvailable, true);
  assert.ok(list.skippedInvalid > 0);
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['Newest copy'],
  );
  assert.equal(local.getItem(older.key) !== null, true);
  assert.equal(local.getItem(newer.key) !== null, true);
});

test('renaming a library path keeps the existing draft identity discoverable without deleting it', () => {
  const oldId = 'library:workspace:old.forma.json';
  const newId = 'library:workspace:new.forma.json';
  const record = persistDraft('account:rename', oldId, doc('Unsaved before rename'), 'rev-rename');
  linkDraftIdentity('account:rename', oldId, newId);
  const recovered = findRecoverableDraft(
    'account:rename',
    newId,
    doc('Saved version'),
    'rev-rename',
  );
  assert.equal(recovered?.doc.title, 'Unsaved before rename');
  assert.equal(recovered?.record.storageKey, record.key);
  assert.equal(readDrafts('account:rename', oldId).length, 1);
});

test('legacy document is offered for recovery without removing its original bytes', () => {
  const original = JSON.stringify({ version: 2, title: 'Legacy unsaved', nodes: [], edges: [] });
  local.setItem('forma.document.v1', original);
  local.removeItem('forma.document.v1.migrated');
  assert.equal(readLegacyDraft()?.title, 'Legacy unsaved');
  assert.equal(local.getItem('forma.document.v1'), original);
  local.setItem('forma.document.v1.migrated', 'kept');
  assert.equal(readLegacyDraft(), null);
  assert.equal(local.getItem('forma.document.v1'), original);
});
