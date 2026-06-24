import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Brief } from "./brief.js";
import { appendAssumption } from "./assumptions.js";
import { buildPayload, sendNotification } from "./notify.js";

function makeCwd() {
  return mkdtempSync(join(tmpdir(), "adlc-notify-"));
}

const brief: Brief = {
  project: "test",
  decisions: { recipient: "dev@example.com" },
};

const briefNoRecipient: Brief = {
  project: "test",
  decisions: {},
};

describe("buildPayload", () => {
  it("includes preview URL in subject and body", () => {
    const payload = buildPayload("dev@example.com", "https://x.vercel.app", "Assumptions: none");
    expect(payload.subject).toContain("https://x.vercel.app");
    expect(payload.content[0].value).toContain("https://x.vercel.app");
    expect(payload.personalizations[0].to[0].email).toBe("dev@example.com");
    expect(payload.from.email).toBeDefined();
  });

  it("includes assumptions summary in body", () => {
    const payload = buildPayload("a@b.com", "https://x.vercel.app", "- [PRD] some question");
    expect(payload.content[0].value).toContain("some question");
  });
});

describe("sendNotification — dryRun", () => {
  it("returns payload without sending when dryRun=true", async () => {
    const result = await sendNotification({
      previewUrl: "https://test.vercel.app",
      repoDir: makeCwd(),
      brief,
      apiKey: "fake",
      dryRun: true,
    });

    expect(result.sent).toBe(false);
    expect(result.recipient).toBe("dev@example.com");
    expect(result.payload?.personalizations[0].to[0].email).toBe("dev@example.com");
  });
});

describe("sendNotification — no recipient", () => {
  it("logs assumption and returns sent=false without throwing", async () => {
    const cwd = makeCwd();
    const result = await sendNotification({
      previewUrl: "https://test.vercel.app",
      repoDir: cwd,
      brief: briefNoRecipient,
      apiKey: "fake",
    });

    expect(result.sent).toBe(false);
    expect(result.recipient).toBeNull();
    // ASSUMPTIONS.md written
    const { existsSync, readFileSync } = await import("node:fs");
    expect(existsSync(join(cwd, "ASSUMPTIONS.md"))).toBe(true);
    expect(readFileSync(join(cwd, "ASSUMPTIONS.md"), "utf8")).toContain("recipient");
  });
});

describe("sendNotification — mocked fetch", () => {
  it("POSTs correct SendGrid payload and returns sent=true", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const mockFetch = async (url: string, init?: RequestInit) => {
      requests.push({ url, body: JSON.parse(init?.body as string) });
      return { ok: true, status: 200, text: async () => '{"id":"abc"}' } as Response;
    };

    const cwd = makeCwd();
    // seed an assumption so summary is non-empty
    appendAssumption(cwd, {
      phase: "PRD",
      question: "Which region?",
      decision: "US",
      confidence: 0.4,
      grounding: "no grounding — default",
      at: "2026-06-22T10:00:00.000Z",
    });

    const result = await sendNotification({
      previewUrl: "https://prod.vercel.app",
      repoDir: cwd,
      brief,
      apiKey: "re_abc",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.sent).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
    const body = requests[0].body as { personalizations: { to: { email: string }[] }[]; subject: string };
    expect(body.personalizations[0].to[0].email).toBe("dev@example.com");
    expect(body.subject).toContain("prod.vercel.app");
  });

  it("is best-effort: no apiKey → skips the POST and returns sent=false", async () => {
    let called = false;
    const mockFetch = async () => {
      called = true;
      return { ok: true, status: 202, text: async () => "" } as Response;
    };

    const result = await sendNotification({
      previewUrl: "https://x.vercel.app",
      repoDir: makeCwd(),
      brief,
      apiKey: "",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.sent).toBe(false);
    expect(result.recipient).toBe("dev@example.com");
    expect(called).toBe(false);
  });

  it("throws on non-ok SendGrid response", async () => {
    const mockFetch = async () =>
      ({ ok: false, status: 422, text: async () => "invalid_to" }) as Response;

    await expect(
      sendNotification({
        previewUrl: "https://x.vercel.app",
        repoDir: makeCwd(),
        brief,
        apiKey: "bad",
        fetchFn: mockFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow("422");
  });
});
