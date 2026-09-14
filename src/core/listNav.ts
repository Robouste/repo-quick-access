// Selected-row math for the overlay's ↑/↓ navigation, kept pure and DOM-free so it's
// unit-testable the same way src/lib/keyboard.ts's accelerator parsing is.

/**
 * Next selected index for an ArrowUp (`delta: -1`) or ArrowDown (`delta: 1`) press.
 * Wraps around both ends of the list; starts from the top on the way down, or the
 * bottom on the way up, when nothing is selected yet (or the selection fell out of
 * range, e.g. the list just got shorter after a keystroke).
 */
export function moveSelection(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (current < 0 || current >= length) return delta === 1 ? 0 : length - 1;
  return (current + delta + length) % length;
}
