<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";

  // Settings window: scanned folders, shortcut, autostart. Filled in by later tickets.
</script>

<main>
  <h1>Settings</h1>
  <p>Nothing to configure yet.</p>
  <button type="button" onclick={() => void getCurrentWindow().close()}>Close</button>
</main>

<style>
  main {
    padding: 16px;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  }
</style>
