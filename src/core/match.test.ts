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
  function item(name: string, path = `/code/${name}`): Searchable {
    return { name, path };
  }

  it("returns every item, unsorted, for an empty query", () => {
    const items = [item("b"), item("a")];
    expect(fuzzyFilter("", items)).toEqual(items);
  });

  it("drops items that don't match", () => {
    const items = [item("repo-a"), item("repo-b")];
    expect(fuzzyFilter("zzz", items)).toEqual([]);
  });

  it("ranks a name match above a path-only match", () => {
    const nameMatch = item("access", "/code/other");
    const pathMatchOnly = item("other", "/code/access");
    const result = fuzzyFilter("access", [pathMatchOnly, nameMatch]);
    expect(result).toEqual([nameMatch, pathMatchOnly]);
  });

  it("matches against the path for queries that include a separator", () => {
    const entry = item("frontend", "/code/repo-quick-access/frontend");
    expect(fuzzyFilter("quick-access/front", [entry])).toEqual([entry]);
  });
});
