# Repo Quick Access

Press a shortcut, get an overlay listing every git repository found in the folders you
configured, type to filter, hit Enter — VS Code opens. Detects `.code-workspace` files and
offers them alongside the plain folder.

Targets **Linux** and **Windows**. Built with [Tauri v2](https://tauri.app) and
[Svelte 5](https://svelte.dev); all application logic is TypeScript, the Rust side only
registers plugins.

## Prerequisites

- Node.js 24 + [pnpm](https://pnpm.io)
- Rust stable via [rustup](https://rustup.rs)
- Platform libraries:
  - **Fedora / Nobara:** `sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libxdo-devel openssl-devel`
  - **Debian / Ubuntu:** `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Windows:** Visual Studio C++ Build Tools and the WebView2 runtime (see the
    [Tauri prerequisites](https://tauri.app/start/prerequisites/))

## Development

```sh
pnpm install
pnpm tauri dev      # run the app with hot reload
pnpm tauri build    # produce installers in src-tauri/target/release/bundle
```

Quality gates (run by CI):

```sh
pnpm lint           # eslint
pnpm format:check   # prettier
pnpm check          # svelte-check / tsc
pnpm test           # vitest
```

## Layout

```
src/
  routes/             SvelteKit pages: `/` overlay, `/settings` settings window
  lib/core/           pure TypeScript: scanner, launcher, config (unit-tested)
src-tauri/
  src/lib.rs          plugin registration only
  capabilities/       permission allow-list for the frontend
  tauri.conf.json     window + bundle configuration
```

## Global shortcut on Wayland

Wayland compositors do not let applications grab global keys, so the in-app shortcut only
works on Windows and Linux/X11. On Wayland, bind a shortcut in your desktop environment to the
app binary: the running instance receives the second launch and shows the overlay.
