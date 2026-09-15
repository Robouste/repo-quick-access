import { describe, expect, it, vi } from "vitest";
import type { Shell } from "./launcher";
import { launchEditor } from "./launcher";

describe("launchEditor", () => {
  it("runs the custom executable when one is configured, skipping the defaults", async () => {
    const runDefault = vi.fn();
    const runCustom = vi.fn().mockResolvedValue(undefined);
    const shell: Shell = { runDefault, runCustom };

    await launchEditor("/code/repo-a", "/opt/vscodium/bin/codium", shell);

    expect(runCustom).toHaveBeenCalledWith("/opt/vscodium/bin/codium", "/code/repo-a");
    expect(runDefault).not.toHaveBeenCalled();
  });

  it("tries `code` first when no custom executable is configured", async () => {
    const runDefault = vi.fn().mockResolvedValue(undefined);
    const shell: Shell = { runDefault, runCustom: vi.fn() };

    await launchEditor("/code/repo-a", undefined, shell);

    expect(runDefault).toHaveBeenCalledTimes(1);
    expect(runDefault).toHaveBeenCalledWith("code", "/code/repo-a");
  });

  it("falls back to `code.cmd` when `code` can't be found", async () => {
    const runDefault = vi
      .fn()
      .mockRejectedValueOnce(new Error("program not found"))
      .mockResolvedValueOnce(undefined);
    const shell: Shell = { runDefault, runCustom: vi.fn() };

    await launchEditor("/code/repo-a", undefined, shell);

    expect(runDefault).toHaveBeenNthCalledWith(1, "code", "/code/repo-a");
    expect(runDefault).toHaveBeenNthCalledWith(2, "code.cmd", "/code/repo-a");
  });

  it("throws the last error when every default program fails", async () => {
    const runDefault = vi.fn().mockRejectedValue(new Error("program not found"));
    const shell: Shell = { runDefault, runCustom: vi.fn() };

    await expect(launchEditor("/code/repo-a", undefined, shell)).rejects.toThrow(
      "program not found",
    );
  });

  it("surfaces a failure from the custom executable instead of falling back to defaults", async () => {
    const runDefault = vi.fn();
    const runCustom = vi.fn().mockRejectedValue(new Error("permission denied"));
    const shell: Shell = { runDefault, runCustom };

    await expect(launchEditor("/code/repo-a", "/opt/vscodium/bin/codium", shell)).rejects.toThrow(
      "permission denied",
    );
    expect(runDefault).not.toHaveBeenCalled();
  });
});
