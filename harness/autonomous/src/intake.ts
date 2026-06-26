import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface IntakeResult {
  source: "url" | "file";
  raw: string;
  normalized: string;
  /** True when static extraction yielded too little content (bundled SPA/compiled bundle). */
  isSpa: boolean;
}

// Minimum chars to consider extracted text "meaningful" — below this = SPA/bundle.
const MIN_CONTENT_LENGTH = 200;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
}

function extractMeta(html: string, name: string): string {
  return (
    html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]+)"`, "i"))?.[1]?.trim() ??
    html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+name="${name}"`, "i"))?.[1]?.trim() ??
    ""
  );
}

// Use matchAll so all heading positions are collected before processing —
// avoids the double-exec bug where calling exec() inside a while(exec()) loop
// consumes two matches per iteration.
// Returns both the text and how many real headings were found.
function extractSections(html: string): { text: string; sectionCount: number } {
  const matches = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)];

  if (matches.length === 0) {
    return { text: stripHtml(html), sectionCount: 0 };
  }

  const sections: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const heading = stripHtml(match[2]).trim();
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[i + 1]?.index ?? html.length;
    const body = stripHtml(html.slice(bodyStart, bodyEnd)).trim();
    if (heading) {
      sections.push(`### ${heading}\n${body}`);
    }
  }

  return { text: sections.join("\n\n") || stripHtml(html), sectionCount: matches.length };
}

// Claude `.dc.html` design-companion files embed the entire design as a
// JSON-encoded HTML string inside `<script type="__bundler/template">`.
// The outer page is a JS runner that unpacks it at runtime — static readers
// only see "Bundled Page … Unpacking…". Extract and return the inner HTML so
// the section extractor gets real design content instead of the SPA wrapper.
function extractDcBundleTemplate(html: string): string | null {
  const match = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const inner = JSON.parse(match[1]);
    if (typeof inner === "string" && inner.length > 200) return inner;
  } catch {
    // Not valid JSON — not a dc bundle we can extract
  }
  return null;
}

// For bundled SPAs the content is inside compressed JS — static extraction yields
// almost nothing. Return meta hints + the file path so the Level 2 Claude runner
// can open the file directly with its native Read/browser tools.
function spaFallback(linkOrPath: string, html: string): string {
  const title = extractTitle(html);
  const description = extractMeta(html, "description");
  const lines = [
    title ? `Title: ${title}` : null,
    description ? `Description: ${description}` : null,
    `[BUNDLED SPA: static extraction insufficient. INTAKE skill should read this file directly: ${linkOrPath}]`,
  ].filter(Boolean);
  return lines.join("\n");
}

function findLocalDesignFile(fileParam: string | null): string | null {
  const possiblePaths = [
    resolve(process.cwd(), "../../design"),
    resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../design"),
  ];

  for (const designDir of possiblePaths) {
    if (!existsSync(designDir)) continue;
    
    const files = readdirSync(designDir);
    
    if (fileParam) {
      const searchNames = [
        fileParam,
        decodeURIComponent(fileParam),
        fileParam.replace(/\+/g, " "),
        decodeURIComponent(fileParam.replace(/\+/g, " ")),
      ];

      // 1. Exact match
      for (const name of searchNames) {
        if (files.includes(name)) {
          return join(designDir, name);
        }
      }

      // 2. Case-insensitive / normalized match
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const name of searchNames) {
        const normSearch = normalize(name);
        if (!normSearch) continue;
        
        for (const file of files) {
          if (normalize(file) === normSearch) {
            return join(designDir, file);
          }
          // Check substring overlap
          const fileNorm = normalize(file);
          if (fileNorm.includes(normSearch) || normSearch.includes(fileNorm)) {
            return join(designDir, file);
          }
        }
      }
    }

    // 3. Fallback: if there is only one html file in the design dir, use it!
    const htmlFiles = files.filter(f => f.endsWith(".html"));
    if (htmlFiles.length === 1) {
      return join(designDir, htmlFiles[0]);
    }
  }

  return null;
}

// Try to load a local copy of a claude.ai/design file. Returns {raw, source} on
// success, or null if no matching local file exists. Used both when the fetch
// errors (403/network) and when the fetch succeeds but returns the app shell
// instead of the dc bundle (200 with SPA content).
function tryClaudeLocalFallback(
  linkOrPath: string,
  reason: string,
): { raw: string; source: "file" } | null {
  if (!linkOrPath.includes("claude.ai/design/")) return null;
  try {
    const urlObj = new URL(linkOrPath);
    const fileParam = urlObj.searchParams.get("file");
    const localFile = findLocalDesignFile(fileParam);
    if (localFile && existsSync(localFile)) {
      console.log(`[intake] ${reason}. Falling back to local design file: ${localFile}`);
      return { raw: readFileSync(localFile, "utf8"), source: "file" };
    }
  } catch {
    // URL parse failure or fs error — caller decides whether to re-throw
  }
  return null;
}

export async function intake(linkOrPath: string, fetchFn?: typeof fetch): Promise<IntakeResult> {
  let raw: string;
  let source: "url" | "file";

  if (linkOrPath.startsWith("http://") || linkOrPath.startsWith("https://")) {
    const fetcher = fetchFn ?? fetch;
    // claude.ai design share links are session-gated → 403 on a bare fetch.
    // Pass the browser session cookie via ADLC_DESIGN_COOKIE, plus a real
    // User-Agent (a missing UA alone also trips 403 on many CDNs).
    const cookie = process.env.ADLC_DESIGN_COOKIE;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    if (cookie) {
      headers.Cookie = cookie;
    }

    try {
      const res = await fetcher(linkOrPath, { headers, redirect: "follow" });
      if (!res.ok) {
        const hint =
          res.status === 403 && !cookie
            ? " — set ADLC_DESIGN_COOKIE to your claude.ai session cookie for private share links"
            : "";
        throw new Error(`Intake fetch failed: ${res.status} ${res.statusText}${hint}`);
      }
      raw = await res.text();
      source = "url";
    } catch (err) {
      const fallback = tryClaudeLocalFallback(
        linkOrPath,
        `Fetch failed (${err instanceof Error ? err.message : String(err)})`,
      );
      if (fallback) {
        raw = fallback.raw;
        source = fallback.source;
      } else {
        throw err;
      }
    }
  } else {
    if (!existsSync(linkOrPath)) {
      throw new Error(`Intake file not found: ${linkOrPath}`);
    }
    raw = readFileSync(linkOrPath, "utf8");
    source = "file";
  }

  // For Claude .dc.html design-companion files the real HTML is embedded inside a
  // JSON-encoded __bundler/template script. Unwrap it before section extraction so
  // downstream phases see actual design content instead of the "Unpacking…" SPA shell.
  const designHtml = extractDcBundleTemplate(raw) ?? raw;

  const extracted = extractSections(designHtml);
  const hadHeadings = /<h[1-3][^>]*>/i.test(designHtml);
  // use extracted if: headings found (structure present) OR text is long enough
  // fall back to SPA hint only when: no headings AND content too short (bundled/compressed app)
  let isSpa = !hadHeadings && extracted.text.length < MIN_CONTENT_LENGTH;

  // The URL may have returned 200 with the claude.ai app shell instead of the dc
  // bundle (common when the share link serves the web-app wrapper, not the file
  // directly). If we got SPA content from a URL, try the local file before giving up.
  if (isSpa && source === "url") {
    const fallback = tryClaudeLocalFallback(
      linkOrPath,
      "Fetch returned app-shell SPA (not the dc bundle)",
    );
    if (fallback) {
      const fbDesignHtml = extractDcBundleTemplate(fallback.raw) ?? fallback.raw;
      const fbExtracted = extractSections(fbDesignHtml);
      const fbHadHeadings = /<h[1-3][^>]*>/i.test(fbDesignHtml);
      const fbIsSpa = !fbHadHeadings && fbExtracted.text.length < MIN_CONTENT_LENGTH;
      if (!fbIsSpa) {
        // Local file is richer — use it
        raw = fallback.raw;
        source = fallback.source;
        isSpa = false;
        return { source, raw, normalized: fbExtracted.text, isSpa };
      }
    }
  }

  const normalized = isSpa ? spaFallback(linkOrPath, raw) : extracted.text;

  if (isSpa) {
    console.warn(
      `[intake] SPA/bundle detected — static extraction yielded too little content. ` +
        `The design file at ${linkOrPath} must be opened directly by the INTAKE skill. ` +
        `Downstream phases will receive only the SPA hint, not a real design summary.`,
    );
  }

  return { source, raw, normalized, isSpa };
}
