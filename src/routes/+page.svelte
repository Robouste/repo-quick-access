<script lang="ts">
  import { resolve } from "$app/paths";

  // Overlay window: search input + repository list. Filled in by later tickets.
  let query = $state("");
</script>

<main class="overlay">
  <header>
    <input type="search" placeholder="Search repositories…" bind:value={query} />
    <a href={resolve("/settings")} aria-label="Settings">⚙</a>
  </header>
  <ul class="results">
    <li class="empty">No folders configured yet.</li>
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

  a {
    color: inherit;
    text-decoration: none;
    font-size: 1.25rem;
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
</style>
