import type { Brief } from "./brief.js";
import { appendAssumption } from "./assumptions.js";
import { summarizeAssumptions } from "./assumptions.js";

export interface NotifyArgs {
  previewUrl: string;
  repoDir: string;
  brief: Brief;
  apiKey: string;
  from?: string;
  fetchFn?: typeof fetch;
  dryRun?: boolean;
}

export interface NotifyResult {
  sent: boolean;
  recipient: string | null;
  payload: SendGridPayload | null;
}

// SendGrid v3 mail/send payload (https://docs.sendgrid.com/api-reference/mail-send/mail-send).
export interface SendGridPayload {
  personalizations: { to: { email: string }[] }[];
  from: { email: string };
  subject: string;
  content: { type: string; value: string }[];
}

export function buildPayload(
  recipient: string,
  previewUrl: string,
  assumptionsSummary: string,
  from = "adlc@noreply.bitcot.com",
): SendGridPayload {
  return {
    personalizations: [{ to: [{ email: recipient }] }],
    from: { email: from },
    subject: `[ADLC] Preview ready: ${previewUrl}`,
    content: [
      {
        type: "text/plain",
        value: `Your preview is ready:\n\n${previewUrl}\n\n---\nAssumptions logged during this run:\n${assumptionsSummary}`,
      },
    ],
  };
}

function resolveRecipient(brief: Brief): string | undefined {
  const decisions = brief.decisions as Record<string, string>;
  return decisions["recipient"] ?? decisions["email"] ?? decisions["notify"];
}

export async function sendNotification(args: NotifyArgs): Promise<NotifyResult> {
  const recipient = resolveRecipient(args.brief);

  if (!recipient) {
    appendAssumption(args.repoDir, {
      phase: "EMAIL",
      question: "Who should receive the preview URL notification?",
      decision: "No recipient in brief — notification skipped",
      confidence: 0.0,
      grounding: "no grounding — default",
      at: new Date().toISOString(),
    });
    return { sent: false, recipient: null, payload: null };
  }

  const assumptionsSummary = summarizeAssumptions(args.repoDir);
  const payload = buildPayload(recipient, args.previewUrl, assumptionsSummary, args.from);

  if (args.dryRun) {
    return { sent: false, recipient, payload };
  }

  // ponytail: best-effort. No key → skip the POST (email disabled in prod: SendGrid 401,
  // sender IP not whitelisted). Matches orchestrator.ts, where the EMAIL step is commented out.
  if (!args.apiKey) {
    return { sent: false, recipient, payload };
  }

  const fetcher = args.fetchFn ?? fetch;
  const res = await fetcher("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid API error ${res.status}: ${body}`);
  }

  return { sent: true, recipient, payload };
}
