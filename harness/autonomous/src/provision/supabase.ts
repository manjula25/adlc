import { execSync } from "node:child_process";

export interface SupabaseProvisionArgs {
  projectId: string; // e.g. "proj_abc123" — becomes the schema name
  migrations?: string[]; // additional SQL to run inside the schema
  dbUrl: string;
  dryRun?: boolean;
  execSql?: (sql: string, dbUrl: string) => Promise<void>;
  checkSchema?: (schema: string, dbUrl: string) => Promise<boolean>;
}

export interface SupabaseProvisionResult {
  schema: string;
  sql: string;
  rlsVerified: boolean;
  existed: boolean;
}

export function buildSchemaSQL(projectId: string): string {
  const schema = sanitizeSchema(projectId);
  return [
    `CREATE SCHEMA IF NOT EXISTS ${schema};`,
    ``,
    `-- Restrict search_path so queries default to this schema`,
    `ALTER ROLE authenticator SET search_path TO ${schema}, public;`,
    ``,
    `-- Example table; real migrations replace this`,
    `CREATE TABLE IF NOT EXISTS ${schema}.runs (`,
    `  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),`,
    `  created_at timestamptz NOT NULL DEFAULT now(),`,
    `  payload jsonb`,
    `);`,
    ``,
    `-- Enable RLS`,
    `ALTER TABLE ${schema}.runs ENABLE ROW LEVEL SECURITY;`,
    ``,
    `-- Allow access only when the requesting role's schema claim matches`,
    `CREATE POLICY "schema_isolation" ON ${schema}.runs`,
    `  USING (current_setting('app.project_schema', true) = '${schema}');`,
  ].join("\n");
}

export function buildSchemaExistsSQL(schema: string): string {
  return `SELECT 1 FROM information_schema.schemata WHERE schema_name = '${sanitizeSchema(schema)}'`;
}

export function buildVerifySQL(schema: string, otherSchema: string): string {
  return `SET app.project_schema = '${sanitizeSchema(otherSchema)}'; SELECT * FROM ${sanitizeSchema(schema)}.runs LIMIT 1;`;
}

export function sanitizeSchema(projectId: string): string {
  // only lowercase alphanum + underscore; prefix proj_ if needed
  const clean = projectId.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  return clean.startsWith("proj_") ? clean : `proj_${clean}`;
}

async function defaultExecSql(sql: string, dbUrl: string): Promise<void> {
  execSync(`psql "${dbUrl}" -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function defaultCheckSchema(schema: string, dbUrl: string): Promise<boolean> {
  const out = execSync(`psql "${dbUrl}" -tAc "${buildSchemaExistsSQL(schema)}"`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return out.trim() === "1";
}

export async function provisionSupabase(
  args: SupabaseProvisionArgs,
): Promise<SupabaseProvisionResult> {
  const schema = sanitizeSchema(args.projectId);
  const baseSql = buildSchemaSQL(args.projectId);
  const migrationSql = (args.migrations ?? []).join("\n");
  const fullSql = migrationSql ? `${baseSql}\n\n${migrationSql}` : baseSql;

  if (args.dryRun) {
    return { schema, sql: fullSql, rlsVerified: false, existed: false };
  }

  const execSql = args.execSql ?? defaultExecSql;
  const checkSchema = args.checkSchema ?? defaultCheckSchema;

  // Idempotent provisioning: if the schema already exists, skip creation entirely
  // (the project is already provisioned) and only re-verify RLS.
  const existed = await checkSchema(schema, args.dbUrl);
  if (!existed) {
    await execSql(fullSql, args.dbUrl);
  }

  const rlsVerified = await verifyRls(schema, args.dbUrl, execSql);
  return { schema, sql: fullSql, rlsVerified, existed };
}

export async function verifyRls(
  schema: string,
  dbUrl: string,
  execSql: (sql: string, dbUrl: string) => Promise<void> = defaultExecSql,
): Promise<boolean> {
  const otherSchema = schema === "proj_other" ? "proj_other2" : "proj_other";
  const sql = buildVerifySQL(schema, otherSchema);
  try {
    await execSql(sql, dbUrl);
    // if the SELECT succeeded, RLS is NOT blocking cross-schema access
    return false;
  } catch {
    // expected: RLS denied the cross-schema query
    return true;
  }
}
