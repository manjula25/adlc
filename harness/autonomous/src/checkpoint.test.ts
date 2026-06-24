import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { clearCheckpoint, loadCheckpoint, recordPhase } from "./checkpoint.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "adlc-ckpt-"));
}

describe("checkpoint", () => {
  it("returns null when no checkpoint exists", () => {
    expect(loadCheckpoint(tmp())).toBeNull();
  });

  it("records phases in order without duplicates", () => {
    const dir = tmp();
    recordPhase(dir, "PRD");
    recordPhase(dir, "ISSUES");
    recordPhase(dir, "PRD"); // duplicate — must be ignored
    expect(loadCheckpoint(dir)?.completed).toEqual(["PRD", "ISSUES"]);
  });

  it("clears the checkpoint file", () => {
    const dir = tmp();
    recordPhase(dir, "IMPLEMENT");
    expect(existsSync(join(dir, ".adlc", "state.json"))).toBe(true);
    clearCheckpoint(dir);
    expect(loadCheckpoint(dir)).toBeNull();
  });

  it("clear is a no-op when nothing is recorded", () => {
    expect(() => clearCheckpoint(tmp())).not.toThrow();
  });
});
