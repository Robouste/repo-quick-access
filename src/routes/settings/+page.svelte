<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { open } from "@tauri-apps/plugin-dialog";
  import { getAutostart, setAutostart } from "$lib/autostart";
  import {
    DEFAULT_DEPTH,
    loadConfig,
    saveFolders,
    saveShortcut,
    saveVsCodePath,
    type ScannedFolder,
  } from "$lib/config";
  import { acceleratorFromEvent } from "$lib/keyboard";
  import { getShortcut, getShortcutStatus, setShortcut, type ShortcutStatus } from "$lib/shortcut";

  let loading = $state(true);
  let folders: ScannedFolder[] = $state([]);
  let shortcut = $state("");
  let shortcutStatus: ShortcutStatus = $state({ kind: "pending" });
  let shortcutError: string | undefined = $state();
  let recording = $state(false);
  let autostart = $state(false);
  let vsCodePath: string | undefined = $state();

  onMount(() => {
    void (async () => {
      const [config, currentShortcut, currentStatus, currentAutostart] = await Promise.all([
        loadConfig(),
        getShortcut(),
        getShortcutStatus(),
        getAutostart(),
      ]);
      folders = config.folders;
      shortcut = currentShortcut;
      shortcutStatus = currentStatus;
      autostart = currentAutostart;
      vsCodePath = config.vsCodePath;
      loading = false;
    })();
  });

  async function persistFolders() {
    await saveFolders(folders);
  }

  async function addFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string" || folders.some((f) => f.path === selected)) return;
    folders = [...folders, { path: selected, depth: DEFAULT_DEPTH }];
    await persistFolders();
  }

  function removeFolder(path: string) {
    folders = folders.filter((f) => f.path !== path);
    void persistFolders();
  }

  function setDepth(path: string, depth: number) {
    folders = folders.map((f) => (f.path === path ? { ...f, depth } : f));
    void persistFolders();
  }

  function startRecording() {
    recording = true;
    shortcutError = undefined;
  }

  async function onRecordKeydown(event: KeyboardEvent) {
    if (!recording) return;
    event.preventDefault();
    if (event.key === "Escape") {
      recording = false;
      return;
    }
    const accelerator = acceleratorFromEvent(event);
    if (!accelerator) return; // only modifiers held so far
    recording = false;
    try {
      const status = await setShortcut(accelerator);
      shortcutStatus = status;
      shortcut = accelerator;
      // A "failed" status (combo already grabbed elsewhere) is transient feedback,
      // not something to persist over a working configuration.
      if (status.kind !== "failed") await saveShortcut(accelerator);
    } catch (e) {
      shortcutError = String(e);
    }
  }

  async function onAutostartChange(event: Event & { currentTarget: HTMLInputElement }) {
    const on = event.currentTarget.checked;
    await setAutostart(on);
    autostart = on;
  }

  async function pickVsCodePath() {
    const selected = await open({ directory: false, multiple: false });
    if (typeof selected !== "string") return;
    vsCodePath = selected;
    await saveVsCodePath(vsCodePath);
  }

  async function clearVsCodePath() {
    vsCodePath = undefined;
    await saveVsCodePath(undefined);
  }
</script>

<svelte:window onkeydown={onRecordKeydown} />

<main>
  <h1>Settings</h1>

  {#if loading}
    <p>Loading…</p>
  {:else}
    <section>
      <h2>Folders</h2>
      {#if folders.length === 0}
        <p class="hint">No folders configured yet.</p>
      {:else}
        <ul class="folders">
          {#each folders as folder (folder.path)}
            <li>
              <span class="path" title={folder.path}>{folder.path}</span>
              <label>
                Depth
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={folder.depth}
                  onchange={(e) => setDepth(folder.path, e.currentTarget.valueAsNumber || 0)}
                />
              </label>
              <button
                type="button"
                aria-label="Remove folder"
                onclick={() => removeFolder(folder.path)}>✕</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      <button type="button" onclick={() => void addFolder()}>Add folder…</button>
    </section>

    <section>
      <h2>Shortcut</h2>
      <div class="shortcut-row">
        <kbd>{recording ? "Press a key combination…" : shortcut}</kbd>
        {#if recording}
          <button type="button" onclick={() => (recording = false)}>Cancel</button>
        {:else}
          <button type="button" onclick={startRecording}>Change</button>
        {/if}
      </div>
      {#if shortcutError}
        <p class="error">{shortcutError}</p>
      {:else if shortcutStatus.kind === "unsupported"}
        <p class="hint">{shortcutStatus.reason}</p>
      {:else if shortcutStatus.kind === "failed"}
        <p class="error">Could not register {shortcutStatus.accelerator}: {shortcutStatus.error}</p>
      {/if}
    </section>

    <section>
      <h2>Editor</h2>
      <p class="hint">
        Uses <kbd>code</kbd> on PATH by default. Set a custom path for Insiders, VSCodium, or an install
        not on PATH.
      </p>
      <div class="shortcut-row">
        <span class="path" title={vsCodePath}>{vsCodePath ?? "Default (code on PATH)"}</span>
        <button type="button" onclick={() => void pickVsCodePath()}>Browse…</button>
        {#if vsCodePath}
          <button type="button" onclick={() => void clearVsCodePath()}>Reset</button>
        {/if}
      </div>
    </section>

    <section>
      <h2>Startup</h2>
      <label>
        <input type="checkbox" checked={autostart} onchange={onAutostartChange} />
        Start automatically when you log in
      </label>
    </section>
  {/if}

  <button type="button" onclick={() => void getCurrentWindow().close()}>Close</button>
</main>

<style>
  main {
    padding: 16px;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  }

  section {
    margin-bottom: 20px;
  }

  h2 {
    font-size: 0.95rem;
    margin: 0 0 8px;
  }

  .hint {
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .error {
    color: #c0392b;
    font-size: 0.9rem;
  }

  .folders {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
  }

  .folders li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folders input[type="number"] {
    width: 3.5rem;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  kbd {
    padding: 4px 8px;
    border-radius: 4px;
    background: #eee;
    font-family: inherit;
  }
</style>
