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

describe("intake — dc bundle extraction", () => {
  it("extracts real design content from a __bundler/template dc.html", async () => {
    const innerHtml = "<html><body><h1>Login</h1><p>Staff access only.</p><h2>Dashboard</h2><p>KPIs and activity.</p></body></html>";
    const dcHtml = `<!DOCTYPE html><html><head><title>Bundled Page</title></head><body>
<script type="__bundler/template">${JSON.stringify(innerHtml)}</script>
</body></html>`;
    const mockFetch = async (_url: string) => ({
      ok: true, status: 200, statusText: "OK", text: async () => dcHtml,
    });
    const result = await intake("https://example.com/design.dc.html", mockFetch as unknown as typeof fetch);
    expect(result.isSpa).toBe(false);
    expect(result.normalized).toContain("Login");
    expect(result.normalized).toContain("Dashboard");
  });

  it("does not flag dc bundle as SPA once template is extracted", async () => {
    const innerHtml = "<html><body><h1>Sign in</h1><p>Mentorship portal.</p></body></html>";
    const dcHtml = `<script type="__bundler/manifest">{}</script><script type="__bundler/template">${JSON.stringify(innerHtml)}</script>`;
    const mockFetch = async (_url: string) => ({
      ok: true, status: 200, statusText: "OK", text: async () => dcHtml,
    });
    const result = await intake("https://example.com/app.dc.html", mockFetch as unknown as typeof fetch);
    expect(result.isSpa).toBe(false);
    expect(result.normalized.length).toBeGreaterThan(0);
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

  it("falls back to local file when 200 response is the app-shell SPA, not the dc bundle", async () => {
    // Simulates claude.ai returning the web-app wrapper (200) instead of the dc bundle
    const appShellHtml = `<!DOCTYPE html><html><head><title>claude.ai</title></head><body>
      <script>window.__NEXT_DATA__={}</script></body></html>`;
    const mockFetch = async (_url: string) => ({
      ok: true, status: 200, statusText: "OK", text: async () => appShellHtml,
    });
    const result = await intake(
      "https://claude.ai/design/p/some-uuid?file=SDIAS+Operations+Hub.dc.html&via=share",
      mockFetch as unknown as typeof fetch
    );
    // Local file fallback should have kicked in — we get real design content, not the app shell
    expect(result.source).toBe("file");
    expect(result.isSpa).toBe(false);
    expect(result.normalized).toContain("SDIAS Operations Hub");
  });
});
