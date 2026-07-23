import { UsageError } from '../errors.js';

/**
 * A repo (知识库) reference given on the command line: either a numeric id
 * or a `group/slug` namespace. Both map onto the same /repos/... URL shape.
 */
export type RepoRef =
  { kind: 'id'; id: string } | { kind: 'namespace'; group: string; slug: string };

export function parseRepoRef(input: string): RepoRef {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return { kind: 'id', id: trimmed };
  const parts = trimmed.split('/');
  if (parts.length === 2 && parts[0] !== '' && parts[1] !== '') {
    return { kind: 'namespace', group: parts[0], slug: parts[1] };
  }
  throw new UsageError(
    `Invalid repo reference "${input}" — expected a numeric id (e.g. 123456) or a namespace (e.g. group/slug)`
  );
}

/** URL base for a repo: /repos/{id} or /repos/{group}/{slug}. */
export function repoBasePath(ref: RepoRef): string {
  return ref.kind === 'id'
    ? `/repos/${encodeURIComponent(ref.id)}`
    : `/repos/${encodeURIComponent(ref.group)}/${encodeURIComponent(ref.slug)}`;
}
