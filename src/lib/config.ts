// Typed, versioned settings schema, persisted with `plugin-store` in the same
// `settings.json` file src-tauri/src/shortcut.rs reads at boot.
//
// The `shortcut` key is a plain top-level string — not nested under this schema — so it
// stays byte-for-byte what shortcut.rs already reads (see its `STORE_KEY` comment: "read
// here, never written here"). `version` and `folders` are this module's own to evolve;
// `resolveConfig` is the single seam a future schema change migrates through.
import { load, Store } from "@tauri-apps/plugin-store";

export interface ScannedFolder {
  /** Absolute path chosen through the native folder dialog. */
  path: string;
  /** How many directory levels below `path` the scanner descends. */
  depth: number;
}

export interface Config {
  version: number;
  folders: ScannedFolder[];
  /**
   * Custom VS Code (or Insiders/VSCodium) executable path, for installs `code` on PATH
   * won't find. Unset uses the default `code`/`code.cmd` lookup.
   */
  vsCodePath?: string;
}

export const DEFAULT_DEPTH = 1;
export const CURRENT_VERSION = 1;

const FILE = "settings.json";
const KEY_VERSION = "version";
const KEY_FOLDERS = "folders";
const KEY_SHORTCUT = "shortcut";
const KEY_VSCODE_PATH = "vsCodePath";

/**
 * Reshapes whatever was on disk into the current `Config`. There is only one shape so
 * far, so this is a no-op beyond stamping the current version — but it's where a future
 * migration (e.g. a v1 `folders` entry gaining a required field) would branch on
 * `rawVersion` before the rest of the app ever sees the old data.
 */
export function resolveConfig(
  rawVersion: number | undefined,
  rawFolders: ScannedFolder[] | undefined,
  rawVsCodePath?: string,
): Config {
  return {
    version: CURRENT_VERSION,
    folders: rawFolders ?? [],
    vsCodePath: rawVsCodePath,
  };
}

let storePromise: Promise<Store> | undefined;
function openStore(): Promise<Store> {
  return (storePromise ??= load(FILE));
}

export async function loadConfig(): Promise<Config> {
  const store = await openStore();
  const [rawVersion, rawFolders, rawVsCodePath] = await Promise.all([
    store.get<number>(KEY_VERSION),
    store.get<ScannedFolder[]>(KEY_FOLDERS),
    store.get<string>(KEY_VSCODE_PATH),
  ]);
  return resolveConfig(rawVersion, rawFolders, rawVsCodePath);
}

export async function saveFolders(folders: ScannedFolder[]): Promise<void> {
  const store = await openStore();
  await store.set(KEY_VERSION, CURRENT_VERSION);
  await store.set(KEY_FOLDERS, folders);
  await store.save();
}

/** Persists the Settings window's custom VS Code executable path; `undefined` clears it. */
export async function saveVsCodePath(path: string | undefined): Promise<void> {
  const store = await openStore();
  await store.set(KEY_VERSION, CURRENT_VERSION);
  if (path) {
    await store.set(KEY_VSCODE_PATH, path);
  } else {
    await store.delete(KEY_VSCODE_PATH);
  }
  await store.save();
}

/**
 * Persists the accelerator that `setShortcut` (src/lib/shortcut.ts) just registered.
 * Kept separate from that call so a registration failure never writes a broken value.
 */
export async function saveShortcut(accelerator: string): Promise<void> {
  const store = await openStore();
  await store.set(KEY_SHORTCUT, accelerator);
  await store.save();
}
