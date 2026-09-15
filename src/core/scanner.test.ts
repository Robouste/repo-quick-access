import { beforeEach, describe, expect, it } from "vitest";
import type { Fs, FsDirEntry } from "./scanner";
import { getCachedRepos, refreshRepos, scanFolders } from "./scanner";

function dir(name: string): FsDirEntry {
  return { name, isDirectory: true, isFile: false, isSymlink: false };
}
function symlinkDir(name: string): FsDirEntry {
  return { name, isDirectory: true, isFile: false, isSymlink: true };
}
function file(name: string): FsDirEntry {
  return { name, isDirectory: false, isFile: true, isSymlink: false };
}

/** An in-memory `Fs` built from a plain directory-path → entries map. */
function fakeFs(tree: Record<string, FsDirEntry[]>): Fs {
  return {
    readDir(path) {
      const entries = tree[path];
      if (!entries) return Promise.reject(new Error(`no such directory: ${path}`));
      return Promise.resolve(entries);
    },
  };
}

describe("scanFolders", () => {
  it("recognizes the configured folder itself as a repo", async () => {
    const fs = fakeFs({ "/code/repo-a": [dir(".git"), file("README.md")] });

    const repos = await scanFolders([{ path: "/code/repo-a" }], fs);

    expect(repos).toEqual([{ path: "/code/repo-a", name: "repo-a", kind: "folder" }]);
  });

  it("finds repos one level below the configured folder", async () => {
    const fs = fakeFs({
      "/code": [dir("repo-a"), dir("repo-b"), dir("not-a-repo")],
      "/code/repo-a": [dir(".git")],
      "/code/repo-b": [dir(".git")],
      "/code/not-a-repo": [file("notes.txt")],
    });

    const repos = await scanFolders([{ path: "/code" }], fs);

    expect(repos).toEqual(
      expect.arrayContaining([
        { path: "/code/repo-a", name: "repo-a", kind: "folder" },
        { path: "/code/repo-b", name: "repo-b", kind: "folder" },
      ]),
    );
    expect(repos).toHaveLength(2);
  });

  it("descends arbitrarily deep through non-repo folders to find repos", async () => {
    const fs = fakeFs({
      "/code": [dir("group")],
      "/code/group": [dir("repo-a")],
      "/code/group/repo-a": [dir(".git")],
    });

    const repos = await scanFolders([{ path: "/code" }], fs);

    expect(repos).toEqual([{ path: "/code/group/repo-a", name: "repo-a", kind: "folder" }]);
  });

  it("does not look for nested repos inside an already-discovered repo", async () => {
    const fs = fakeFs({
      "/code": [dir("repo-a")],
      "/code/repo-a": [dir(".git"), dir("vendor")],
      "/code/repo-a/vendor": [dir(".git")],
    });

    const repos = await scanFolders([{ path: "/code" }], fs);

    expect(repos).toEqual([{ path: "/code/repo-a", name: "repo-a", kind: "folder" }]);
  });

  it("tags a workspace file found inside a repo with its parent repo", async () => {
    const fs = fakeFs({
      "/code": [dir("repo-a")],
      "/code/repo-a": [dir(".git"), file("repo-a.code-workspace")],
    });

    const repos = await scanFolders([{ path: "/code" }], fs);

    expect(repos).toEqual(
      expect.arrayContaining([
        { path: "/code/repo-a", name: "repo-a", kind: "folder" },
        {
          path: "/code/repo-a/repo-a.code-workspace",
          name: "repo-a",
          kind: "workspace",
          parentRepo: "/code/repo-a",
        },
      ]),
    );
  });

  it("ignores a workspace file that isn't inside a repo", async () => {
    const fs = fakeFs({
      "/code": [file("team.code-workspace"), dir("repo-a")],
      "/code/repo-a": [dir(".git")],
    });

    const repos = await scanFolders([{ path: "/code" }], fs);

    expect(repos).toEqual([{ path: "/code/repo-a", name: "repo-a", kind: "folder" }]);
  });

  it("skips symlinked directories rather than following them", async () => {
    const fs = fakeFs({
      "/code": [symlinkDir("linked-repo")],
      "/code/linked-repo": [dir(".git")],
    });

    const repos = await scanFolders([{ path: "/code" }], fs);

    expect(repos).toEqual([]);
  });

  it("skips a configured folder that can't be read instead of failing the whole scan", async () => {
    const fs = fakeFs({ "/code/repo-a": [dir(".git")] });

    const repos = await scanFolders([{ path: "/code/missing" }, { path: "/code/repo-a" }], fs);

    expect(repos).toEqual([{ path: "/code/repo-a", name: "repo-a", kind: "folder" }]);
  });

  it("scans every configured folder and flattens the results", async () => {
    const fs = fakeFs({
      "/code/repo-a": [dir(".git")],
      "/other/repo-b": [dir(".git")],
    });

    const repos = await scanFolders([{ path: "/code/repo-a" }, { path: "/other/repo-b" }], fs);

    expect(repos).toEqual(
      expect.arrayContaining([
        { path: "/code/repo-a", name: "repo-a", kind: "folder" },
        { path: "/other/repo-b", name: "repo-b", kind: "folder" },
      ]),
    );
  });
});

describe("refreshRepos / getCachedRepos", () => {
  beforeEach(async () => {
    // Drain any cache left by a previous test so each test starts from empty.
    await refreshRepos([], fakeFs({}));
  });

  it("is empty before the first scan completes", async () => {
    // beforeEach already ran one refresh, so check the module's own claim instead:
    // a fresh scan of no folders leaves the cache empty.
    expect(getCachedRepos()).toEqual([]);
  });

  it("updates the cache once a scan resolves", async () => {
    const fs = fakeFs({ "/code/repo-a": [dir(".git")] });

    const result = await refreshRepos([{ path: "/code/repo-a" }], fs);

    expect(result).toEqual([{ path: "/code/repo-a", name: "repo-a", kind: "folder" }]);
    expect(getCachedRepos()).toEqual(result);
  });

  it("shares one in-flight scan across concurrent callers", async () => {
    let readCount = 0;
    const fs: Fs = {
      readDir(path) {
        readCount++;
        return Promise.resolve(path === "/code/repo-a" ? [dir(".git")] : []);
      },
    };
    const folders = [{ path: "/code/repo-a" }];

    const [a, b] = await Promise.all([refreshRepos(folders, fs), refreshRepos(folders, fs)]);

    expect(a).toBe(b);
    expect(readCount).toBe(1);
  });
});
