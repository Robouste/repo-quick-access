// Launches a repo or `.code-workspace` file (see src/core/scanner.ts's `RepoEntry`) in
// VS Code. Pure orchestration kept separate from the two ways a process actually gets
// spawned, so it's unit-testable against a fake `Shell` instead of a real child process
// (see launcher.test.ts); `tauriShell` below is the only part that talks to Tauri.
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";

/**
 * The two program names allow-listed under `shell:allow-execute` in
 * capabilities/default.json. Tried in order rather than picked by platform detection:
 * exactly one exists as a real program on any given machine (`code.cmd` is the default
 * Windows CLI shim), so the first `ENOENT`-style failure is enough to know to try the
 * other.
 */
const DEFAULT_PROGRAMS = ["code", "code.cmd"];

/** Shell seam the launcher runs through — swapped for a fake in tests. */
export interface Shell {
  /** Runs one of `DEFAULT_PROGRAMS` directly via plugin-shell's scoped `Command.create`. */
  runDefault(program: string, path: string): Promise<void>;
  /**
   * Runs an arbitrary, user-configured executable through the native `launch_editor`
   * Tauri command — plugin-shell's scope is fixed at build time, so it can't allow-list
   * a path the user only picks at runtime in Settings.
   */
  runCustom(executable: string, path: string): Promise<void>;
}

async function runDefault(program: string, path: string): Promise<void> {
  const output = await Command.create(program, [path]).execute();
  if (output.code !== 0) {
    throw new Error(output.stderr || `${program} exited with code ${output.code}`);
  }
}

const tauriShell: Shell = {
  runDefault,
  runCustom: (executable, path) => invoke("launch_editor", { executable, path }),
};

/**
 * Opens `path` in VS Code and resolves once the editor has been launched.
 *
 * `executablePath`, when set (the Settings override for Insiders/VSCodium/non-PATH
 * installs), is used as-is instead of the default lookup. Throws with a message meant
 * to be shown directly to the user (e.g. as an error toast) if every attempt fails.
 */
export async function launchEditor(
  path: string,
  executablePath: string | undefined,
  shell: Shell = tauriShell,
): Promise<void> {
  if (executablePath) {
    await shell.runCustom(executablePath, path);
    return;
  }

  let lastError: unknown;
  for (const program of DEFAULT_PROGRAMS) {
    try {
      await shell.runDefault(program, path);
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
