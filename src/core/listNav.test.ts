import { describe, expect, it } from "vitest";
import { moveSelection } from "./listNav";

describe("moveSelection", () => {
  it("returns -1 for an empty list", () => {
    expect(moveSelection(0, 1, 0)).toBe(-1);
    expect(moveSelection(-1, -1, 0)).toBe(-1);
  });

  it("starts at the top when nothing is selected and the list grows downward", () => {
    expect(moveSelection(-1, 1, 3)).toBe(0);
  });

  it("starts at the bottom when nothing is selected and the list grows upward", () => {
    expect(moveSelection(-1, -1, 3)).toBe(2);
  });

  it("advances by one within range", () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(1, -1, 3)).toBe(0);
  });

  it("wraps from the last row to the first going down", () => {
    expect(moveSelection(2, 1, 3)).toBe(0);
  });

  it("wraps from the first row to the last going up", () => {
    expect(moveSelection(0, -1, 3)).toBe(2);
  });

  it("resets into range when the previous selection is now out of bounds", () => {
    expect(moveSelection(5, 1, 3)).toBe(0);
    expect(moveSelection(5, -1, 3)).toBe(2);
  });
});
