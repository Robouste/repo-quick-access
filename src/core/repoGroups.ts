// Turns the scanner's flat `RepoEntry[]` (see scanner.ts) into the rows the overlay's
// list renders and keyboard nav walks: each repo folder immediately followed by the
// `.code-workspace` files found inside it, per issue #7 ("workspaces grouped under
// their repo"). Kept separate from match.ts so the two concerns — ranking and grouping
// — stay independently testable.
import { fuzzyFilter } from "./match";
import type { RepoEntry } from "./scanner";

export interface RepoGroup {
  key: string;
  /** Absent when every workspace found for this group has no parent repo. */
  folder?: RepoEntry;
  workspaces: RepoEntry[];
}

/**
 * Groups entries by repo: a `"folder"` entry starts a group keyed by its path, and each
 * `"workspace"` entry joins its `parentRepo`'s group (or starts its own single-entry
 * group, keyed by its own path, when it has none). Group order follows each group's
 * first appearance in `entries`.
 */
export function groupEntries(entries: RepoEntry[]): RepoGroup[] {
  const groups = new Map<string, RepoGroup>();
  const order: string[] = [];

  function ensure(key: string): RepoGroup {
    let group = groups.get(key);
    if (!group) {
      group = { key, workspaces: [] };
      groups.set(key, group);
      order.push(key);
    }
    return group;
  }

  for (const entry of entries) {
    if (entry.kind === "folder") ensure(entry.path).folder = entry;
  }
  for (const entry of entries) {
    if (entry.kind === "workspace") ensure(entry.parentRepo ?? entry.path).workspaces.push(entry);
  }

  return order.map((key) => groups.get(key)!);
}

/** Flattens groups into the row order the list renders. */
export function flattenRows(groups: RepoGroup[]): RepoEntry[] {
  return groups.flatMap((group) =>
    [group.folder, ...group.workspaces].filter((entry): entry is RepoEntry => entry !== undefined),
  );
}

/** Filters `entries` by `query`, then groups and flattens them into rows to render. */
export function searchRepos(query: string, entries: RepoEntry[]): RepoEntry[] {
  return flattenRows(groupEntries(fuzzyFilter(query, entries)));
}
