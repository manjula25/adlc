import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { intake } from "./intake.js";

const fixtureHtml = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "fixtures",
  "intake",
  "sample.html",
);

describe("intake — file path", () => {
  it("reads local HTML and returns non-empty normalized text", async () => {
    const result = await intake(fixtureHtml);
    expect(result.source).toBe("file");
    expect(result.normalized.length).toBeGreaterThan(0);
  });

  it("normalized text contains feature/section hints from the HTML", async () => {
    const result = await intake(fixtureHtml);
    expect(result.normalized).toContain("SDIAS Operations Hub");
    expect(result.normalized).toContain("ticket");
  });

  it("throws on missing file", async () => {
    await expect(intake("/nonexistent/path/file.html")).rejects.toThrow("not found");
  });
});

describe("intake — URL (mocked fetch)", () => {
  it("fetches and normalizes the response body", async () => {
    const mockFetch = async (_url: string) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        "<html><body><h1>My App</h1><p>A task manager with real-time sync.</p></body></html>",
    });

    const result = await intake("https://example.com/design", mockFetch as unknown as typeof fetch);
    expect(result.source).toBe("url");
    expect(result.normalized).toContain("My App");
    expect(result.normalized).toContain("task manager");
  });

  it("throws on non-ok response", async () => {
    const mockFetch = async (_url: string) => ({ ok: false, status: 404, statusText: "Not Found", text: async () => "" });
    await expect(
      intake("https://example.com/missing", mockFetch as unknown as typeof fetch),
    ).rejects.toThrow("404");
  });

  it("falls back to local design folder html when claude.ai fetch fails", async () => {
    const mockFetch = async (_url: string) => ({ ok: false, status: 403, statusText: "Forbidden", text: async () => "" });
    
    // Using a file query parameter that we expect to find via the single HTML fallback or partial match
    const result = await intake(
      "https://claude.ai/design/p/some-uuid?file=SDIAS+Operations+Hub.dc.html&via=share",
      mockFetch as unknown as typeof fetch
    );
    expect(result.source).toBe("file");
    expect(result.normalized).toContain("SDIAS Operations Hub");
  });
});
