import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore, type Searchable } from "./match";

describe("fuzzyScore", () => {
  it("matches the empty query against anything", () => {
    expect(fuzzyScore("", "repo-quick-access")).toBe(0);
  });

  it("matches a subsequence regardless of case", () => {
    expect(fuzzyScore("RQA", "repo-quick-access")).not.toBeUndefined();
  });

  it("does not match when a query character is missing", () => {
    expect(fuzzyScore("rqz", "repo-quick-access")).toBeUndefined();
  });

  it("does not match out-of-order characters", () => {
    expect(fuzzyScore("qr", "repo-quick-access")).toBeUndefined();
  });

  it("scores a consecutive run higher than the same letters scattered", () => {
    // No dashes/underscores here on purpose: a word-boundary bonus for every scattered
    // letter would swamp the effect this test is isolating.
    const consecutive = fuzzyScore("repo", "repoward");
    const scattered = fuzzyScore("repo", "rxexpxox");
    expect(consecutive).toBeGreaterThan(scattered!);
  });

  it("scores a word-boundary match higher than a mid-word one", () => {
    const boundary = fuzzyScore("q", "repo-quick-access"); // q starts a segment
    const midWord = fuzzyScore("u", "repo-quick-access"); // u is mid-segment
    expect(boundary).toBeGreaterThan(midWord!);
  });

  it("prefers a shorter target among equally good matches", () => {
    const short = fuzzyScore("repo", "repo");
    const long = fuzzyScore("repo", "repository");
    expect(short).toBeGreaterThan(long!);
  });
});

describe("fuzzyFilter", () => {
  function item(name: string): Searchable {
    return { name };
  }

  it("returns every item, unsorted, for an empty query", () => {
    const items = [item("b"), item("a")];
    expect(fuzzyFilter("", items)).toEqual(items);
  });

  it("drops items that don't match", () => {
    const items = [item("repo-a"), item("repo-b")];
    expect(fuzzyFilter("zzz", items)).toEqual([]);
  });

  it("ranks a better name match above a weaker one", () => {
    const strong = item("rpgm-translator");
    const weak = item("f95-manager"); // "rpg" is a scattered subsequence, not intended
    const result = fuzzyFilter("rpg", [weak, strong]);
    expect(result).toEqual([strong]);
  });

  it("does not match a query that only exists across unrelated name parts", () => {
    // Regression: "rpg" must not match via letters borrowed from elsewhere (e.g. a
    // sibling's absolute path); scoring only `name` means "f95-manager" doesn't have an
    // "r" or a "p" at all, so it can't match "rpg" no matter how the letters are spread.
    expect(fuzzyFilter("rpg", [item("f95-manager")])).toEqual([]);
  });
});
