import { describe, expect, it } from "vitest";
import { CURRENT_VERSION, resolveConfig } from "./config";

describe("resolveConfig", () => {
  it("defaults to an empty folder list when nothing was stored", () => {
    expect(resolveConfig(undefined, undefined)).toEqual({ version: CURRENT_VERSION, folders: [] });
  });

  it("keeps stored folders and stamps the current version", () => {
    const folders = [{ path: "/home/user/code", depth: 2 }];
    expect(resolveConfig(1, folders)).toEqual({ version: CURRENT_VERSION, folders });
  });

  it("stamps the current version even for an unrecognized stored version", () => {
    const folders = [{ path: "/home/user/code", depth: 1 }];
    expect(resolveConfig(99, folders).version).toBe(CURRENT_VERSION);
  });
});
