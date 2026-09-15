import { describe, expect, it } from "vitest";
import { flattenRows, groupEntries, searchRepos } from "./repoGroups";
import type { RepoEntry } from "./scanner";

function folder(path: string): RepoEntry {
  return { path, name: path.split("/").pop()!, kind: "folder" };
}
function workspace(path: string, parentRepo?: string): RepoEntry {
  const name = path.split("/").pop()!.replace(".code-workspace", "");
  return { path, name, kind: "workspace", parentRepo };
}

describe("groupEntries", () => {
  it("puts a workspace in its parent repo's group", () => {
    const repoA = folder("/code/repo-a");
    const ws = workspace("/code/repo-a/repo-a.code-workspace", "/code/repo-a");

    expect(groupEntries([repoA, ws])).toEqual([
      { key: "/code/repo-a", folder: repoA, workspaces: [ws] },
    ]);
  });

  it("gives a parentless workspace its own group", () => {
    const ws = workspace("/code/team.code-workspace");

    expect(groupEntries([ws])).toEqual([
      { key: "/code/team.code-workspace", folder: undefined, workspaces: [ws] },
    ]);
  });

  it("keeps a repo with no workspaces as a folder-only group", () => {
    const repoA = folder("/code/repo-a");

    expect(groupEntries([repoA])).toEqual([{ key: "/code/repo-a", folder: repoA, workspaces: [] }]);
  });

  it("orders groups by first appearance", () => {
    const repoA = folder("/code/repo-a");
    const repoB = folder("/code/repo-b");

    expect(groupEntries([repoB, repoA]).map((g) => g.key)).toEqual([
      "/code/repo-b",
      "/code/repo-a",
    ]);
  });
});

describe("flattenRows", () => {
  it("shows the folder when a repo has no workspace", () => {
    const repoA = folder("/code/repo-a");

    expect(flattenRows(groupEntries([repoA]))).toEqual([repoA]);
  });

  it("shows a repo's workspaces instead of its bare folder", () => {
    const repoA = folder("/code/repo-a");
    const ws = workspace("/code/repo-a/repo-a.code-workspace", "/code/repo-a");

    expect(flattenRows(groupEntries([repoA, ws]))).toEqual([ws]);
  });

  it("shows every workspace when a repo has more than one", () => {
    const repoA = folder("/code/repo-a");
    const ws1 = workspace("/code/repo-a/one.code-workspace", "/code/repo-a");
    const ws2 = workspace("/code/repo-a/two.code-workspace", "/code/repo-a");

    expect(flattenRows(groupEntries([repoA, ws1, ws2]))).toEqual([ws1, ws2]);
  });

  it("shows a parentless workspace on its own", () => {
    const ws = workspace("/code/team.code-workspace");

    expect(flattenRows(groupEntries([ws]))).toEqual([ws]);
  });
});

describe("searchRepos", () => {
  it("filters before grouping, dropping repos that don't match", () => {
    const repoA = folder("/code/repo-a");
    const repoB = folder("/code/repo-b");

    expect(searchRepos("repo-a", [repoA, repoB])).toEqual([repoA]);
  });

  it("returns every row, grouped, for an empty query", () => {
    const repoA = folder("/code/repo-a");
    const ws = workspace("/code/repo-a/repo-a.code-workspace", "/code/repo-a");

    expect(searchRepos("", [repoA, ws])).toEqual([ws]);
  });
});
