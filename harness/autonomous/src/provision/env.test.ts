import { describe, expect, it } from "vitest";

import { requireEnv, REQUIRED_VARS } from "./env.js";

describe("requireEnv", () => {
  it("returns a record when all vars are present", () => {
    const env = { GH_TOKEN: "gh_abc", VERCEL_TOKEN: "vt_xyz" };
    const result = requireEnv(["GH_TOKEN", "VERCEL_TOKEN"], env);
    expect(result).toEqual({ GH_TOKEN: "gh_abc", VERCEL_TOKEN: "vt_xyz" });
  });

  it("throws naming the missing var when one is absent", () => {
    const env = { GH_TOKEN: "gh_abc" };
    expect(() => requireEnv(["GH_TOKEN", "VERCEL_TOKEN"], env)).toThrow("VERCEL_TOKEN");
  });

  it("throws naming all missing vars when multiple absent", () => {
    expect(() => requireEnv(["GH_TOKEN", "RESEND_API_KEY"], {})).toThrow(/GH_TOKEN.*RESEND_API_KEY|RESEND_API_KEY.*GH_TOKEN/);
  });

  it("REQUIRED_VARS covers the four expected tokens (SENDGRID is best-effort, not required)", () => {
    expect(REQUIRED_VARS).toContain("GH_TOKEN");
    expect(REQUIRED_VARS).toContain("VERCEL_TOKEN");
    expect(REQUIRED_VARS).toContain("SUPABASE_ACCESS_TOKEN");
    expect(REQUIRED_VARS).toContain("SUPABASE_DB_URL");
    expect(REQUIRED_VARS).not.toContain("SENDGRID_API_KEY");
  });
});
