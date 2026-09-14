import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, type KeyCombo } from "./keyboard";

function combo(partial: Partial<KeyCombo> & { code: string }): KeyCombo {
  return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

describe("acceleratorFromEvent", () => {
  it("waits for a non-modifier key", () => {
    for (const code of ["ControlLeft", "ControlRight", "AltLeft", "ShiftRight", "MetaLeft"]) {
      expect(acceleratorFromEvent(combo({ code }))).toBeUndefined();
    }
  });

  it("strips the Key/Digit prefix to match shortcut::DEFAULT's style", () => {
    expect(acceleratorFromEvent(combo({ code: "KeyR", ctrlKey: true, altKey: true }))).toBe(
      "Ctrl+Alt+R",
    );
    expect(acceleratorFromEvent(combo({ code: "Digit5" }))).toBe("5");
  });

  it("leaves other key codes as-is", () => {
    expect(acceleratorFromEvent(combo({ code: "F1" }))).toBe("F1");
    expect(acceleratorFromEvent(combo({ code: "Space", shiftKey: true }))).toBe("Shift+Space");
  });

  it("combines every held modifier, in a fixed order", () => {
    const accelerator = acceleratorFromEvent(
      combo({ code: "ArrowUp", ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }),
    );
    expect(accelerator).toBe("Ctrl+Alt+Shift+Super+ArrowUp");
  });

  it("produces a bare key with no modifiers held", () => {
    expect(acceleratorFromEvent(combo({ code: "F5" }))).toBe("F5");
  });
});
