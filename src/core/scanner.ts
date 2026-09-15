// Repository scanner: walks the folders configured in src/lib/config.ts and finds git
// repositories and VS Code workspace files inside them. Pure TS so it can be unit tested
// against an in-memory `Fs` instead of the real filesystem (see scanner.test.ts); the
// default `Fs` implementation below is the only part that talks to `plugin-fs`.
import { readDir } from "@tauri-apps/plugin-fs";
import type { ScannedFolder } from "$lib/config";

export interface RepoEntry {
  /** Absolute path to the repo folder or the `.code-workspace` file. */
  path: string;
  name: string;
  kind: "folder" | "workspace";
  /** Set when this is a workspace file found inside a discovered repo. */
  parentRepo?: string;
}

const WORKSPACE_SUFFIX = ".code-workspace";
const GIT_MARKER = ".git";

/** The slice of `DirEntry` (plugin-fs) the scanner needs. */
export interface FsDirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

/** Filesystem seam the scanner walks through — swapped for an in-memory fake in tests. */
export interface Fs {
  readDir(path: string): Promise<FsDirEntry[]>;
}

const tauriFs: Fs = { readDir: (path) => readDir(path) };

function detectSeparator(path: string): "/" | "\\" {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function joinPath(parent: string, child: string): string {
  const sep = detectSeparator(parent);
  return parent.endsWith(sep) ? `${parent}${child}` : `${parent}${sep}${child}`;
}

function basename(path: string): string {
  const sep = detectSeparator(path);
  const trimmed = path.endsWith(sep) ? path.slice(0, -1) : path;
  const index = trimmed.lastIndexOf(sep);
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}

/**
 * Scans one directory. Once a directory is recognized as a repo (it has a `.git` entry),
 * recursion stops there — nested `.git` folders (vendored copies, submodules) aren't
 * reported as separate repos, and `.code-workspace` files directly inside it are reported
 * tagged with `parentRepo`. A directory that isn't a repo is never reported itself
 * (including any `.code-workspace` files sitting loose inside it) — only its
 * subdirectories are walked, with no depth limit.
 */
async function walk(fs: Fs, path: string, name: string): Promise<RepoEntry[]> {
  let entries: FsDirEntry[];
  try {
    entries = await fs.readDir(path);
  } catch {
    // Folder was removed, or is unreadable (permissions) — skip it rather than fail the
    // whole scan over one bad configured folder.
    return [];
  }

  const isRepo = entries.some((entry) => entry.name === GIT_MARKER);

  if (isRepo) {
    const results: RepoEntry[] = [{ path, name, kind: "folder" }];
    for (const entry of entries) {
      if (entry.isFile && entry.name.endsWith(WORKSPACE_SUFFIX)) {
        results.push({
          path: joinPath(path, entry.name),
          name: entry.name.slice(0, -WORKSPACE_SUFFIX.length),
          kind: "workspace",
          parentRepo: path,
        });
      }
    }
    return results;
  }

  const results: RepoEntry[] = [];
  for (const entry of entries) {
    if (entry.isDirectory && !entry.isSymlink) {
      const child = await walk(fs, joinPath(path, entry.name), entry.name);
      results.push(...child);
    }
  }
  return results;
}

/** Scans every configured folder and flattens the results. */
export async function scanFolders(
  folders: ScannedFolder[],
  fs: Fs = tauriFs,
): Promise<RepoEntry[]> {
  const perFolder = await Promise.all(
    folders.map((folder) => walk(fs, folder.path, basename(folder.path))),
  );
  return perFolder.flat();
}

let cachedRepos: RepoEntry[] = [];
let scanInFlight: Promise<RepoEntry[]> | undefined;

/** The most recent scan result. Empty until the first {@link refreshRepos} resolves. */
export function getCachedRepos(): RepoEntry[] {
  return cachedRepos;
}

/**
 * Re-scans the configured folders and updates the cache. Callers that trigger a rescan
 * for different reasons at once (overlay opening, config being saved) share the same
 * in-flight scan instead of walking the filesystem twice.
 */
export function refreshRepos(folders: ScannedFolder[], fs: Fs = tauriFs): Promise<RepoEntry[]> {
  scanInFlight ??= scanFolders(folders, fs).then((repos) => {
    cachedRepos = repos;
    scanInFlight = undefined;
    return repos;
  });
  return scanInFlight;
}
