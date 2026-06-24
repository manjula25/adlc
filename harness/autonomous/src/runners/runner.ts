export interface RunResult {
  text: string;
  ok: boolean;
  runner: string;
}

export interface RunOpts {
  cwd: string;
  allowEdits?: boolean;
}

export interface Runner {
  name: string;
  runHeadless(prompt: string, opts: RunOpts): Promise<RunResult>;
}
