<script lang="ts">
  import { onMount } from "svelte";
  import { hideOverlay, openSettings } from "$lib/overlay";
  import { loadConfig } from "$lib/config";
  import { moveSelection } from "../core/listNav";
  import { searchRepos } from "../core/repoGroups";
  import { getCachedRepos, refreshRepos, type RepoEntry } from "../core/scanner";

  let query = $state("");
  let selectedIndex = $state(0);
  let entries: RepoEntry[] = $state(getCachedRepos());
  let hasFolders = $state(true); // avoid an empty-state flash before the config loads
  let loading = $state(true);
  let input: HTMLInputElement | undefined = $state();

  const rows = $derived(searchRepos(query, entries));

  // Re-pick the top match whenever the visible rows change, so Enter always opens
  // whatever's highlighted rather than a stale index from a longer previous list.
  $effect(() => {
    void rows;
    selectedIndex = 0;
  });

  async function refresh() {
    const config = await loadConfig();
    hasFolders = config.folders.length > 0;
    entries = await refreshRepos(config.folders);
  }

  function reset() {
    query = "";
    selectedIndex = 0;
  }

  async function open(entry: RepoEntry | undefined) {
    if (!entry) return;
    // TODO(#8): shell out to `code <entry.path>` via src/core/launcher.ts instead of
    // just closing — the launcher itself is a separate ticket.
    reset();
    await hideOverlay();
  }

  function onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        reset();
        void hideOverlay();
        break;
      case "ArrowDown":
        event.preventDefault();
        selectedIndex = moveSelection(selectedIndex, 1, rows.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        selectedIndex = moveSelection(selectedIndex, -1, rows.length);
        break;
      case "Enter":
        event.preventDefault();
        void open(rows[selectedIndex]);
        break;
    }
  }

  // The webview regains focus every time the overlay is shown (see src-tauri/src/overlay.rs):
  // put the caret back, drop whatever was typed last time, and pick up any folder/filesystem
  // changes made while the overlay was hidden.
  function onFocus() {
    input?.focus();
    void refresh();
  }

  onMount(() => {
    void refresh().then(() => (loading = false));
  });

  function scrollIntoViewIfSelected(node: HTMLElement, selected: boolean) {
    if (selected) node.scrollIntoView({ block: "nearest" });
    return {
      update(isSelected: boolean) {
        if (isSelected) node.scrollIntoView({ block: "nearest" });
      },
    };
  }
</script>

{#snippet folderIcon()}
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
{/snippet}

{#snippet workspaceIcon()}
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
{/snippet}

<svelte:window onkeydown={onKeydown} onfocus={onFocus} />

<main class="overlay">
  <header>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="search"
      placeholder="Search repositories…"
      bind:value={query}
      bind:this={input}
      autofocus
    />
    <button type="button" aria-label="Settings" onclick={() => void openSettings()}>⚙</button>
  </header>
  <ul class="results" role="listbox">
    {#if loading}
      <li class="empty">Loading…</li>
    {:else if !hasFolders}
      <li class="empty">
        No folders configured yet.
        <button type="button" class="link" onclick={() => void openSettings()}>Open settings</button
        >.
      </li>
    {:else if entries.length === 0}
      <li class="empty">No repositories found in the configured folders.</li>
    {:else if rows.length === 0}
      <li class="empty">No matches for "{query}".</li>
    {:else}
      {#each rows as row, i (row.path)}
        <li
          class="row"
          class:child={row.kind === "workspace" && row.parentRepo !== undefined}
          role="presentation"
          use:scrollIntoViewIfSelected={i === selectedIndex}
        >
          <button
            type="button"
            role="option"
            aria-selected={i === selectedIndex}
            class="row-button"
            class:selected={i === selectedIndex}
            tabindex="-1"
            onclick={() => void open(row)}
            onmouseenter={() => (selectedIndex = i)}
          >
            {@render (row.kind === "workspace" ? workspaceIcon : folderIcon)()}
            <span class="name">{row.name}</span>
          </button>
        </li>
      {/each}
    {/if}
  </ul>
</main>

<style>
  :global(html, body) {
    margin: 0;
    background: transparent;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    color: #f6f6f6;
  }

  .overlay {
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    padding: 12px;
    border-radius: 12px;
    background: rgba(30, 30, 30, 0.95);
  }

  header {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  input {
    flex: 1;
    padding: 10px 12px;
    font-size: 1rem;
    border-radius: 8px;
    border: 1px solid #444;
    background: #1a1a1a;
    color: inherit;
  }

  header > button {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 4px;
  }

  .results {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    overflow-y: auto;
  }

  .empty {
    opacity: 0.6;
    padding: 8px 12px;
  }

  .empty .link {
    background: none;
    border: none;
    padding: 0;
    color: #6ea8fe;
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
  }

  .row-button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: none;
    background: none;
    color: inherit;
    font-size: 0.95rem;
    text-align: left;
    border-radius: 8px;
    cursor: pointer;
  }

  .row.child .row-button {
    padding-left: 32px;
    opacity: 0.85;
  }

  .row-button.selected {
    background: #2f6feb44;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
