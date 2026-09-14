// Thin wrapper over `@tauri-apps/plugin-autostart`. The OS registration (systemd user
// unit / registry Run key / LaunchAgent) is the source of truth; nothing here is
// mirrored into settings.json, so there is nothing to keep in sync.
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export const getAutostart = (): Promise<boolean> => isEnabled();

export const setAutostart = (on: boolean): Promise<void> => (on ? enable() : disable());
