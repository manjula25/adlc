// SENDGRID_API_KEY intentionally absent — email is best-effort (disabled in prod, sender IP
// not whitelisted). notify.ts skips the POST when the key is unset.
export const REQUIRED_VARS = [
  "GH_TOKEN",
  "VERCEL_TOKEN",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_URL",
] as const;

export type RequiredVar = (typeof REQUIRED_VARS)[number];

export function requireEnv(
  names: readonly string[] = REQUIRED_VARS,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string> {
  const missing = names.filter((n) => !env[n]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Set them before running the ADLC pipeline.`,
    );
  }
  return Object.fromEntries(names.map((n) => [n, env[n] as string]));
}
