// Turns a keypress into a `global-hotkey` accelerator string (see
// https://docs.rs/global-hotkey, the crate behind src-tauri/src/shortcut.rs). Its parser
// matches modifier names and key tokens case-insensitively and accepts the DOM
// `KeyboardEvent.code` values directly (`"KeyR"`, `"Digit5"`, `"ArrowUp"`, `"F1"`, …),
// so recording a shortcut needs no lookup table beyond stripping the `Key`/`Digit`
// prefix to match the shorter form already used for `shortcut::DEFAULT` ("Ctrl+Alt+R").

/** The subset of `KeyboardEvent` this needs, kept narrow so it's testable without a DOM. */
export interface KeyCombo {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODE = /^(Control|Alt|Shift|Meta)(Left|Right)?$/;

function keyToken(code: string): string {
  if (code.startsWith("Key")) return code.slice("Key".length);
  if (code.startsWith("Digit")) return code.slice("Digit".length);
  return code;
}

/**
 * Builds an accelerator string from a keypress, or `undefined` while only modifier keys
 * are held (the combo isn't complete yet — keep waiting for the main key).
 */
export function acceleratorFromEvent(event: KeyCombo): string | undefined {
  if (MODIFIER_CODE.test(event.code)) return undefined;

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");

  return [...modifiers, keyToken(event.code)].join("+");
}
