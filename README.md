# Repo Quick Access

Press a shortcut, get an overlay listing every git repository found in the folders you
configured, type to filter, hit Enter — VS Code opens. Detects `.code-workspace` files and
offers them alongside the plain folder.

Targets **Linux** and **Windows**. Built with [Tauri v2](https://tauri.app) and
[Svelte 5](https://svelte.dev). Feature logic (scanner, config, search, launcher) is
TypeScript; the Rust side registers plugins and owns the OS-lifecycle glue (tray, global
shortcut, overlay show/hide, settings window, quit). **Rust is preferred whenever it gives better performance
or user experience**, TypeScript-only is not a hard rule.

## Installation

Grab the latest build from the
[GitHub releases page](https://github.com/Robouste/repo-quick-access/releases/latest):

- **Linux:** the `.AppImage` runs anywhere (`chmod +x` it, then run); `.deb` and `.rpm` are
  provided for Debian/Ubuntu and Fedora-based distros.
- **Windows:** the `.msi` or the NSIS `.exe` installer.

The app starts hidden — look for the tray icon after launching it, and see
[Triggering the overlay](#triggering-the-overlay) below to set up the shortcut, especially on
Wayland where a global shortcut can't be registered directly.

## Prerequisites

The following is only needed to build from source — skip it if you installed a release above.


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
pnpm start:debug    # build the frontend, compile a debug binary with it embedded, run it
pnpm tauri build    # produce installers in src-tauri/target/release/bundle
```

`start:debug` is the closest thing to the shipped app without bundling: no Vite server, the
frontend is embedded exactly as in release. The app starts hidden, so look for the tray icon.

It passes `--features custom-protocol`, which is what switches the webview from the dev
server (`build.devUrl`) to the frontend embedded at compile time (`build.frontendDist`). A
plain `cargo run` without that feature expects `pnpm dev` to be running and otherwise shows
_Could not connect to localhost_.

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
  lib/overlay.ts      wrappers over the Rust overlay commands
  lib/shortcut.ts     wrappers over the Rust shortcut commands
  lib/core/           pure TypeScript: scanner, launcher, config (unit-tested)
src-tauri/
  src/lib.rs          plugin registration, tray + command wiring
  src/overlay.rs      show / hide / toggle / focus-loss / settings window / quit
  src/shortcut.rs     global shortcut registration and runtime changes
  src/tray.rs         tray icon and menu (Show, Settings, Quit)
  capabilities/       permission allow-list for the frontend
  tauri.conf.json     window + bundle configuration
```

## Overlay and tray behaviour

The app starts hidden; the tray icon is the only visible part. Tray menu: **Show**,
**Settings…**, **Quit**. On Windows and X11 a left click on the icon also shows the overlay.
The overlay hides on <kbd>Esc</kbd>, on focus loss and on a close request (Alt+F4); only
the tray quits. During `pnpm tauri dev` use the tray **Show** entry or launch the binary a
second time to bring the overlay up.

Platform notes:

- **GNOME** shows no tray icons without the _AppIndicator and KStatusNotifierItem Support_
  extension. KDE, Cinnamon, XFCE and Windows work out of the box.
- **Wayland** ignores always-on-top, skip-taskbar and explicit window positions; the
  compositor decides where the overlay appears (usually centered).
- **X11** needs a running compositor for the transparent background; without one the
  window background is black.
- **NVIDIA + Wayland:** GTK3 hands WebKitGTK's GPU frames to the compositor without the
  explicit-sync acquire point that recent NVIDIA drivers require, which kills the app with
  `Error 71 (Protocol error) dispatching to Wayland display` on the first show. The app
  therefore sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` at startup on Linux (shared-memory
  frames, negligible cost for a small overlay). Export the variable yourself, e.g. `=0`, to
  override it.

## Triggering the overlay

The default shortcut is <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd>. Pressing it shows the
overlay; pressing it again while the overlay has focus hides it. The tray **Show** entry and
a second launch of the binary are the other two triggers — all three share one code path.

The shortcut is registered in Rust at startup, before the webview loads, so it keeps working
while the overlay is reloading or has crashed. The settings window re-registers it whenever the
configured value changes, without a restart.

### Wayland

Wayland compositors never deliver key events to an application's global grab, and under
XWayland the grab _succeeds_ while never firing — so the app detects a Wayland session
(`XDG_SESSION_TYPE` / `WAYLAND_DISPLAY`) and does not register at all, rather than claiming a
key it cannot receive. Bind a desktop-environment shortcut to the binary with `--toggle`
instead: the running instance receives the second launch and toggles the overlay.

**KDE Plasma:** System Settings → Keyboard → Shortcuts → Add Command, enter
`repo-quick-access --toggle`, then assign the key.

**GNOME:** Settings → Keyboard → View and Customize Shortcuts → Custom Shortcuts → **+**, with
`repo-quick-access --toggle` as the command. Equivalent from the shell:

```sh
path=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/repo-quick-access/
gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "['$path']"
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$path name 'Repo Quick Access'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$path command 'repo-quick-access --toggle'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$path binding '<Control><Alt>r'
```

Without `--toggle` a relaunch only ever shows the overlay, which is what a desktop icon or
launcher entry should do.
