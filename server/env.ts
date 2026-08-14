import dotenv from "dotenv";
import { resolve } from "node:path";

// Load .env.local into process.env. Imported first (before db/clerk) so those
// modules see DATABASE_URL / CLERK_SECRET_KEY at evaluation time.
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

// Local dev's .env.local has the same real SLACK_WEBHOOK_URL/POSTMARK_API_KEY
// as production (there's no separate dev Slack channel/email sandbox), so
// without this, testing things like "add a project" locally fires real Slack
// messages and emails to real users. Production's systemd unit explicitly
// sets NODE_ENV=production (docs/DEPLOYMENT.md); local dev never sets it —
// server/routes/legacy.ts's mirrorToSlack and server/email.ts's
// sendEmail/sendTemplateEmail check this before making the outbound call.
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
