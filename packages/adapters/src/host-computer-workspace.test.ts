import type { PortableFile } from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { HOST_COMPUTER_MAX_FILE_BYTES } from "./host-computer-protocol.js";
import {
  importHostWorkspace,
  skipsHostWorkspaceFile,
  skipsHostWorkspacePath,
} from "./host-computer-workspace.js";

const file = (path: string, size = 10): PortableFile => ({
  path,
  content: new Uint8Array(size),
});

async function* stream(files: PortableFile[]) {
  for (const item of files) yield item;
}

describe("host computer workspace restore", () => {
  it("skips caches and transient directories at any depth", () => {
    expect(skipsHostWorkspacePath(".browser-profiles/chromium-bot-1/Cache/x")).toBe(true);
    expect(skipsHostWorkspacePath("bots/abc/repo/node_modules/pkg/index.js")).toBe(true);
    expect(skipsHostWorkspacePath("shared/notes/today.md")).toBe(false);
    expect(skipsHostWorkspacePath("shared/repos/app/.git/HEAD")).toBe(false);
  });

  it("skips a file the bridge cannot carry in one request", () => {
    expect(skipsHostWorkspaceFile(file("a.bin", HOST_COMPUTER_MAX_FILE_BYTES))).toBe(false);
    expect(skipsHostWorkspaceFile(file("a.bin", HOST_COMPUTER_MAX_FILE_BYTES + 1))).toBe(true);
  });

  it("restores what fits and leaves the rest, without failing", async () => {
    const written: string[] = [];
    const result = await importHostWorkspace(
      stream([
        file("notes/a.md"),
        file(".browser-profiles/x/big.wasm", 5),
        file("big.bin", HOST_COMPUTER_MAX_FILE_BYTES + 1),
        file("notes/b.md"),
      ]),
      async (item) => void written.push(item.path),
    );
    expect(written).toEqual(["notes/a.md", "notes/b.md"]);
    expect(result).toMatchObject({ imported: 2, skipped: 2 });
  });

  it("stops at the size and file budgets", async () => {
    const written: string[] = [];
    const sizes = await importHostWorkspace(
      stream([file("a", 6), file("b", 6), file("c", 3)]),
      async (item) => void written.push(item.path),
      { maxBytes: 10 },
    );
    expect(written).toEqual(["a", "c"]);
    expect(sizes.skipped).toBe(1);
    const counted: string[] = [];
    await importHostWorkspace(
      stream([file("a"), file("b"), file("c")]),
      async (item) => void counted.push(item.path),
      { maxFiles: 2 },
    );
    expect(counted).toEqual(["a", "b"]);
  });
});
