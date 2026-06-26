import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Brief } from "./brief.js";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export interface Policy {
  rules: string[];
  confidenceThreshold: number;
}

export interface ProjectConfig {
  brief: Brief;
  policy: Policy;
}

// Matches both `- key: value` and `- **key:** value` bullet styles.
function parseKeyValueBullets(section: string): Record<string, string> {
  const out: Record<string, string> = {};
  const strip = (s: string) => s.replace(/^\*+/, "").replace(/\*+$/, "").trim();
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+(.+?)\s*:\s*(.+?)\s*$/);
    if (match) {
      out[strip(match[1])] = strip(match[2]);
    }
  }
  return out;
}

function parsePlainBullets(section: string): string[] {
  const out: string[] = [];
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (match) {
      out.push(match[1].trim());
    }
  }
  return out;
}

// Returns the body text under a `## <heading>` until the next `## ` heading.
function sectionBody(md: string, heading: string): string {
  const lines = md.split(/\r?\n/);
  const body: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      inSection = h[1].trim().toLowerCase() === heading.toLowerCase();
      continue;
    }
    if (inSection) {
      body.push(line);
    }
  }
  return body.join("\n");
}

function extractProject(md: string): string {
  const labeled = md.match(/\*\*Project:\*\*\s*(.+?)\s*$/im);
  if (labeled) {
    return labeled[1].trim();
  }
  const title = md.match(/^#\s+(.+?)\s*$/m);
  return title ? title[1].trim() : "";
}

export function parseBrief(md: string): Brief {
  const decisions = parseKeyValueBullets(sectionBody(md, "Decisions"));
  // Validate and auto-correct malformed email in the "recipient" decision.
  // Past failure: BRIEF had `dev@@bitcot.com` (double @) which propagated
  // through the entire pipeline unchecked. Catch it at the source.
  if (decisions.recipient) {
    const trimmed = decisions.recipient.trim();
    // Collapse consecutive @ into a single @ (dev@@bitcot.com → dev@bitcot.com)
    const corrected = trimmed.replace(/@{2,}/g, "@");
    if (corrected !== trimmed) {
      console.warn(
        `[config] BRIEF recipient "${trimmed}" contains a doubled @ — auto-corrected to "${corrected}"`,
      );
      decisions.recipient = corrected;
    }
  }
  return {
    project: extractProject(md),
    decisions,
  };
}

export function parsePolicy(md: string): Policy {
  const thresholdMatch = md.match(/\*\*Confidence threshold:\*\*\s*([0-9]*\.?[0-9]+)/i);
  return {
    rules: parsePlainBullets(sectionBody(md, "Rules")),
    confidenceThreshold: thresholdMatch
      ? Number(thresholdMatch[1])
      : DEFAULT_CONFIDENCE_THRESHOLD,
  };
}

export function loadProjectConfig(repoDir: string): ProjectConfig {
  const briefPath = join(repoDir, "BRIEF.md");
  if (!existsSync(briefPath)) {
    throw new Error(`BRIEF.md not found in ${repoDir}`);
  }
  const brief = parseBrief(readFileSync(briefPath, "utf8"));

  const policyPath = join(repoDir, "POLICY.md");
  const policy = existsSync(policyPath)
    ? parsePolicy(readFileSync(policyPath, "utf8"))
    : { rules: [], confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD };

  return { brief, policy };
}
