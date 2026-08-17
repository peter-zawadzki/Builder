// Domain-wide-delegation Gmail client, one JWT per impersonated employee
// mailbox. Requires a Google Cloud service account whose Client ID has been
// authorized in Workspace Admin (Security > API Controls > Domain-wide
// Delegation) for the gmail.readonly scope — see docs/DEPLOYMENT.md. Reads
// the key inline at call time (same lazy pattern as ANTHROPIC_API_KEY in
// server/digest/companySummary.ts) so importing this module never crashes
// processes that don't sync Gmail.
import { readFileSync } from "node:fs";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

// Two ways to supply the downloaded service-account JSON key:
// - GOOGLE_SERVICE_ACCOUNT_KEY_PATH: path to the raw .json file (e.g.
//   dropped at the repo root as google-service-account.json, which
//   .gitignore excludes by name so it can never be accidentally committed).
// - GOOGLE_SERVICE_ACCOUNT_KEY: the key contents inline in .env.local,
//   either raw JSON or base64-encoded (to survive .env's single-line format).
function loadServiceAccountKey(): { client_email: string; private_key: string } {
  const path = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (path) return JSON.parse(readFileSync(path, "utf8"));

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_KEY");
  const decoded = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(decoded);
}

export function getGmailClientForUser(email: string) {
  const key = loadServiceAccountKey();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    subject: email, // impersonation target
  });
  return google.gmail({ version: "v1", auth });
}
