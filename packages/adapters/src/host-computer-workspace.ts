import type { PortableFile } from "@rakazo/adapter-kit";
import { getLogger } from "@rakazo/logging";
import { HOST_COMPUTER_MAX_FILE_BYTES } from "./host-computer-protocol.js";

/** Directories that are caches or transient state: never worth carrying between computers. */
const SKIPPED_DIRECTORIES = new Set([
  ".browser-profiles",
  ".cache",
  "node_modules",
  "__pycache__",
  "tmp",
]);

/** A restore into a local computer is bounded, so booting never copies a multi-gigabyte home. */
export const HOST_IMPORT_MAX_BYTES = 512 * 1024 * 1024;
export const HOST_IMPORT_MAX_FILES = 30_000;
const HOST_IMPORT_CONCURRENCY = 8;

export function skipsHostWorkspacePath(relative: string): boolean {
  return relative.split("/").some((segment) => SKIPPED_DIRECTORIES.has(segment));
}

/** A file the local bridge cannot carry in one request, or one not worth carrying. */
export function skipsHostWorkspaceFile(file: Pick<PortableFile, "path" | "content">): boolean {
  return (
    skipsHostWorkspacePath(file.path) || file.content.byteLength > HOST_COMPUTER_MAX_FILE_BYTES
  );
}

/**
 * Restore a saved workspace onto the local computer. Caches, oversized files and anything past the
 * size and count budget are left behind, and the run still starts: a missing clone can be cloned
 * again, a failed boot cannot be fixed by the bot.
 */
export async function importHostWorkspace(
  files: AsyncIterable<PortableFile>,
  write: (file: PortableFile) => Promise<void>,
  limits: { maxBytes?: number; maxFiles?: number } = {},
): Promise<{ imported: number; skipped: number; bytes: number }> {
  const maxBytes = limits.maxBytes ?? HOST_IMPORT_MAX_BYTES;
  const maxFiles = limits.maxFiles ?? HOST_IMPORT_MAX_FILES;
  let imported = 0;
  let skipped = 0;
  let bytes = 0;
  // Each file is its own request, so a few run at once; distinct files never depend on each other.
  const inFlight = new Set<Promise<void>>();
  let failure: unknown;
  for await (const file of files) {
    if (failure) break;
    if (
      skipsHostWorkspaceFile(file) ||
      imported >= maxFiles ||
      bytes + file.content.byteLength > maxBytes
    ) {
      skipped += 1;
      continue;
    }
    imported += 1;
    bytes += file.content.byteLength;
    const task: Promise<void> = write(file)
      .catch((error: unknown) => {
        failure ??= error;
      })
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
    if (inFlight.size >= HOST_IMPORT_CONCURRENCY) await Promise.race(inFlight);
  }
  await Promise.all(inFlight);
  if (failure) throw failure;
  if (skipped > 0) {
    getLogger().warn("local computer restore left files behind", { imported, skipped, bytes });
  }
  return { imported, skipped, bytes };
}
