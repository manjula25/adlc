import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseBrief,
  parsePolicy,
  loadProjectConfig,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from "./config.js";

const BRIEF_MD = `# BRIEF

**Project:** SDIAS Operations Hub

## Decisions
- storage: Postgres
- **auth:** email + password
- region: US
- recipient: dev@example.com
`;

const POLICY_MD = `# POLICY

**Confidence threshold:** 0.8

## Rules
- never auto-drop a schema
- every table must enable RLS
`;

describe("parseBrief", () => {
  it("extracts the project name and decision key/value pairs", () => {
    const brief = parseBrief(BRIEF_MD);
    expect(brief.project).toBe("SDIAS Operations Hub");
    expect(brief.decisions.storage).toBe("Postgres");
    expect(brief.decisions.auth).toBe("email + password");
    expect(brief.decisions.region).toBe("US");
    expect(brief.decisions.recipient).toBe("dev@example.com");
  });

  it("tolerates a missing Decisions section without throwing", () => {
    const brief = parseBrief("# BRIEF\n\n**Project:** Bare\n");
    expect(brief.project).toBe("Bare");
    expect(brief.decisions).toEqual({});
  });

  it("auto-corrects a doubled @ in the recipient decision", () => {
    const brief = parseBrief(`# BRIEF

**Project:** Test

## Decisions
- recipient: dev@@bitcot.com
`);
    expect(brief.decisions.recipient).toBe("dev@bitcot.com");
  });
});

describe("parsePolicy", () => {
  it("extracts rules and an explicit confidence threshold", () => {
    const policy = parsePolicy(POLICY_MD);
    expect(policy.confidenceThreshold).toBe(0.8);
    expect(policy.rules).toContain("never auto-drop a schema");
    expect(policy.rules).toContain("every table must enable RLS");
  });

  it("defaults the confidence threshold when not specified", () => {
    const policy = parsePolicy("# POLICY\n\n## Rules\n- be careful\n");
    expect(policy.confidenceThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(policy.rules).toEqual(["be careful"]);
  });
});

describe("loadProjectConfig", () => {
  it("loads BRIEF.md and POLICY.md from a repo directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "adlc-config-"));
    writeFileSync(join(dir, "BRIEF.md"), BRIEF_MD);
    writeFileSync(join(dir, "POLICY.md"), POLICY_MD);

    const config = loadProjectConfig(dir);
    expect(config.brief.project).toBe("SDIAS Operations Hub");
    expect(config.brief.decisions.storage).toBe("Postgres");
    expect(config.policy.confidenceThreshold).toBe(0.8);
  });

  it("throws a clear error when BRIEF.md is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "adlc-config-"));
    expect(() => loadProjectConfig(dir)).toThrow("BRIEF.md not found");
  });

  it("uses an empty default policy when POLICY.md is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "adlc-config-"));
    writeFileSync(join(dir, "BRIEF.md"), BRIEF_MD);

    const config = loadProjectConfig(dir);
    expect(config.policy.rules).toEqual([]);
    expect(config.policy.confidenceThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
  });
});
