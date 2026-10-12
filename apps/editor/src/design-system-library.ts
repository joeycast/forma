import type { DesignSystem } from '../../../packages/core/src';

function systemSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function normalizeRoleId(value: string): string {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 74);
  if (!clean) return '';
  return /^[a-z]/.test(clean) ? clean : `role_${clean}`;
}

/** Revisions are immutable snapshots; editing existing content requires an explicit new revision. */
export function saveSystemRevision(systems: DesignSystem[], system: DesignSystem): DesignSystem[] {
  const existing = systems.find(
    (item) => item.id === system.id && item.revision === system.revision,
  );
  if (existing) {
    if (JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(system))) {
      throw new Error(
        `Revision ${system.revision} already exists. Increment the revision to save changed content.`,
      );
    }
    return systems;
  }
  return [...systems, system];
}

export function deleteSystemRevision(
  systems: DesignSystem[],
  id: string,
  revision: string,
): DesignSystem[] {
  return systems.filter((item) => item.id !== id || item.revision !== revision);
}

/** Make a separate editable identity; callers may inject a stable suffix for repeatable tests. */
export function duplicateSystem(
  system: DesignSystem,
  suffix = Math.random().toString(36).slice(2, 6),
): DesignSystem {
  return {
    ...structuredClone(system),
    id: `${systemSlug(system.name) || 'design'}-${suffix}`,
    name: `${system.name} copy`,
    revision: '1.0.0',
  };
}
