export interface Brief {
  decisions: Record<string, string>;
  project: string;
}

export const BRIEF: Brief = {
  decisions: {
    format: "Summary",
    database: "Postgres",
    auth: "email + password",
  },
  project: "A headless conductor proof that answers Product Owner questions from an in-memory brief.",
};
