import { ZodError } from 'zod';
import { DocumentError, fingerprint, parseDocument, patchDocument, type Diagram } from './document';

export type DocumentChange = {
  path: string;
  kind: 'added' | 'updated' | 'removed';
  before?: unknown;
  after?: unknown;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
};

function diffValue(before: unknown, after: unknown, path: string, output: DocumentChange[]) {
  if (stable(before) === stable(after)) return;
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const child = `${path}.${key}`;
      if (!(key in a)) output.push({ path: child, kind: 'added', after: b[key] });
      else if (!(key in b)) output.push({ path: child, kind: 'removed', before: a[key] });
      else diffValue(a[key], b[key], child, output);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = [...before, ...after].every(
      (item) => item && typeof item === 'object' && 'id' in item,
    );
    if (keyed) {
      const a = new Map((before as { id: string }[]).map((item) => [item.id, item]));
      const b = new Map((after as { id: string }[]).map((item) => [item.id, item]));
      for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
        const child = `${path}[${id}]`;
        if (!a.has(id)) output.push({ path: child, kind: 'added', after: b.get(id) });
        else if (!b.has(id)) output.push({ path: child, kind: 'removed', before: a.get(id) });
        else diffValue(a.get(id), b.get(id), child, output);
      }
      return;
    }
  }
  output.push({ path, kind: 'updated', before, after });
}

export function diffDocuments(beforeInput: Diagram, afterInput: Diagram): DocumentChange[] {
  const before = parseDocument(beforeInput),
    after = parseDocument(afterInput),
    changes: DocumentChange[] = [];
  diffValue(before, after, 'document', changes);
  return changes;
}

/** Apply a native semantic patch without mutating the base and return a stable, ID-addressed diff. */
export function previewDocumentPatch(baseInput: Diagram, patch: unknown) {
  const base = parseDocument(baseInput);
  let candidate: Diagram;
  try {
    candidate = patchDocument(base, patch);
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    if (error instanceof ZodError)
      throw new DocumentError(
        error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    throw error;
  }
  const changes = diffDocuments(base, candidate);
  return {
    candidate,
    candidateFingerprint: fingerprint(candidate),
    changes,
    summary: {
      added: changes.filter((change) => change.kind === 'added').length,
      updated: changes.filter((change) => change.kind === 'updated').length,
      removed: changes.filter((change) => change.kind === 'removed').length,
      total: changes.length,
      noOp: changes.length === 0,
    },
  };
}
