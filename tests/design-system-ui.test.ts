import test from 'node:test';
import assert from 'node:assert/strict';
import { atelier } from '../packages/core/src';
import {
  deleteSystemRevision,
  duplicateSystem,
  normalizeRoleId,
  saveSystemRevision,
} from '../apps/editor/src/design-system-library';

test('design system revisions are immutable and changed content needs a new revision', () => {
  const old = structuredClone(atelier);
  const nextRevision = { ...structuredClone(atelier), revision: '2.0.0' };
  const edited = { ...structuredClone(atelier), name: 'Updated Atelier' };
  assert.throws(() => saveSystemRevision([old, nextRevision], edited), /Increment the revision/);
  assert.deepEqual(saveSystemRevision([old, nextRevision], old), [old, nextRevision]);
  const newRevision = { ...edited, revision: '1.1.0' };
  const saved = saveSystemRevision([old, nextRevision], newRevision);
  assert.equal(saved.length, 3);
  assert.equal(saved.find((item) => item.revision === '1.0.0')?.name, atelier.name);
  assert.equal(saved.find((item) => item.revision === '1.1.0')?.name, 'Updated Atelier');
  assert.equal(saved.find((item) => item.revision === '2.0.0')?.name, atelier.name);
});

test('deleting a saved system revision leaves other revisions intact', () => {
  const first = structuredClone(atelier);
  const second = { ...structuredClone(atelier), revision: '2.0.0' };
  assert.deepEqual(deleteSystemRevision([first, second], first.id, first.revision), [second]);
});

test('duplicating a design system creates an independent new identity', () => {
  const copy = duplicateSystem(atelier, 'test');
  assert.equal(copy.name, `${atelier.name} copy`);
  assert.equal(copy.id, 'atelier-editorial-test');
  assert.equal(copy.revision, '1.0.0');
  copy.node!.fill = '#000000';
  assert.notEqual(copy.node!.fill, atelier.node!.fill);
});

test('role names normalize to valid assignment identifiers', () => {
  assert.equal(normalizeRoleId('Warning State'), 'warning_state');
  assert.equal(normalizeRoleId('2 Step'), 'role_2_step');
  assert.equal(normalizeRoleId('   '), '');
  assert.match(normalizeRoleId('x'.repeat(200)), /^[a-z][a-z0-9_]{0,79}$/);
});
