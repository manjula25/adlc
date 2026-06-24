import { describe, expect, it } from "vitest";

import {
  buildSchemaSQL,
  buildSchemaExistsSQL,
  sanitizeSchema,
  verifyRls,
  provisionSupabase,
} from "./supabase.js";

describe("sanitizeSchema", () => {
  it("lowercases and adds proj_ prefix when absent", () => {
    expect(sanitizeSchema("ABC123")).toBe("proj_abc123");
  });

  it("keeps proj_ prefix if already present", () => {
    expect(sanitizeSchema("proj_myrun")).toBe("proj_myrun");
  });

  it("replaces non-alphanumeric chars with underscore", () => {
    expect(sanitizeSchema("proj_my-run/1")).toBe("proj_my_run_1");
  });
});

describe("buildSchemaSQL", () => {
  it("creates the schema", () => {
    const sql = buildSchemaSQL("proj_test");
    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS proj_test");
  });

  it("enables RLS on the runs table", () => {
    const sql = buildSchemaSQL("proj_test");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("creates a schema_isolation RLS policy", () => {
    const sql = buildSchemaSQL("proj_test");
    expect(sql).toContain("CREATE POLICY");
    expect(sql).toContain("proj_test");
    expect(sql).toContain("current_setting");
  });

  it("uses the sanitized schema name even when given unsanitized input", () => {
    const sql = buildSchemaSQL("MY-PROJECT");
    expect(sql).toContain("proj_my_project");
    expect(sql).not.toContain("MY-PROJECT");
  });
});

describe("verifyRls — mocked execSql", () => {
  it("returns true when cross-schema SELECT throws (RLS working)", async () => {
    const execSql = async () => { throw new Error("permission denied"); };
    expect(await verifyRls("proj_test", "postgresql://x", execSql)).toBe(true);
  });

  it("returns false when cross-schema SELECT succeeds (RLS broken)", async () => {
    const execSql = async () => { /* no throw = select succeeded */ };
    expect(await verifyRls("proj_test", "postgresql://x", execSql)).toBe(false);
  });
});

describe("provisionSupabase — dryRun", () => {
  it("returns SQL and schema name without executing", async () => {
    const result = await provisionSupabase({
      projectId: "proj_dryrun",
      dbUrl: "postgresql://x",
      dryRun: true,
    });

    expect(result.schema).toBe("proj_dryrun");
    expect(result.sql).toContain("CREATE SCHEMA");
    expect(result.rlsVerified).toBe(false); // not verified in dry-run
  });

  it("includes migration SQL when provided", async () => {
    const result = await provisionSupabase({
      projectId: "proj_migrate",
      dbUrl: "postgresql://x",
      migrations: ["CREATE TABLE IF NOT EXISTS proj_migrate.notes (id uuid PRIMARY KEY);"],
      dryRun: true,
    });

    expect(result.sql).toContain("notes");
  });
});

describe("buildSchemaExistsSQL", () => {
  it("queries information_schema for the sanitized schema name", () => {
    expect(buildSchemaExistsSQL("node-projects")).toBe(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'proj_node_projects'",
    );
  });
});

describe("provisionSupabase — auto-skip when schema exists", () => {
  it("skips creation SQL when checkSchema reports the schema already exists", async () => {
    const executed: string[] = [];
    const result = await provisionSupabase({
      projectId: "node-projects",
      dbUrl: "postgresql://x",
      checkSchema: async () => true,
      execSql: async (sql) => {
        executed.push(sql);
      },
    });

    expect(result.existed).toBe(true);
    // verifyRls still runs (one read-only SELECT), but no CREATE SCHEMA was executed
    expect(executed.some((sql) => sql.includes("CREATE SCHEMA"))).toBe(false);
  });

  it("runs creation SQL when the schema does not yet exist", async () => {
    const executed: string[] = [];
    const result = await provisionSupabase({
      projectId: "node-projects",
      dbUrl: "postgresql://x",
      checkSchema: async () => false,
      execSql: async (sql) => {
        executed.push(sql);
      },
    });

    expect(result.existed).toBe(false);
    expect(executed.some((sql) => sql.includes("CREATE SCHEMA"))).toBe(true);
  });
});
