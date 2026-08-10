// Records a deployment for the digest's company summary to pick up.
// Production has no git history (`.git` is excluded from the rsync
// deploy), so this manual log is the only record of what shipped — run
// this as the last step of every real deploy.
//
// Usage: npx tsx server/digest/logDeployment.ts "Short human-readable summary of what shipped."
import "../env";
import { query } from "../db";

async function main() {
  const summary = process.argv.slice(2).join(" ").trim();
  if (!summary) {
    console.error('Usage: npx tsx server/digest/logDeployment.ts "Summary of what shipped."');
    process.exit(1);
  }
  await query(`INSERT INTO deployments (summary) VALUES ($1)`, [summary]);
  console.log("Logged deployment:", summary);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Failed to log deployment:", e);
  process.exit(1);
});
