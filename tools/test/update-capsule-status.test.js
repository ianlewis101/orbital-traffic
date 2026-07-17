import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadExisting } from "../update-capsule-status.mjs";

/**
 * loadExisting() must tell a genuinely missing capsule-status.json (a real
 * first run, safe to treat as "no history yet") apart from one that exists
 * but is corrupted/truncated/unreadable — the latter must abort the script
 * rather than returning null, which would silently wipe the docking-history
 * log and events array (Finding F11c).
 */

let dir;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
  vi.restoreAllMocks();
});

describe("loadExisting", () => {
  it("returns null for a genuinely missing file, so isFirstRun becomes true", async () => {
    dir = await mkdtemp(join(tmpdir(), "capsule-status-"));
    const missing = join(dir, "capsule-status.json");

    const existing = await loadExisting(missing);

    expect(existing).toBeNull();
    const isFirstRun = !existing || !existing.capsules;
    expect(isFirstRun).toBe(true);
  });

  it("aborts instead of returning null for a corrupted/truncated file", async () => {
    dir = await mkdtemp(join(tmpdir(), "capsule-status-"));
    const corrupted = join(dir, "capsule-status.json");
    // Truncated mid-object, as a crashed writer might leave behind.
    await writeFile(corrupted, '{"updated":"2026-07-16T00:00:00Z","capsules":{"25544":{"pha');

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(loadExisting(corrupted)).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("aborts instead of returning null on a non-ENOENT read error", async () => {
    dir = await mkdtemp(join(tmpdir(), "capsule-status-"));
    // A directory where a file is expected triggers EISDIR, not ENOENT —
    // this must be treated as "corrupted", not "missing".
    const asDirectory = join(dir, "capsule-status.json");
    await mkdir(asDirectory);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(loadExisting(asDirectory)).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
