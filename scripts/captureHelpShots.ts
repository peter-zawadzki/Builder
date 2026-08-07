// Unattended screenshot capture for the 7 "how do I…" flows referenced by
// server/data/helpVisuals.ts. Authenticates via Clerk's sign-in-tokens API
// (using the existing CLERK_SECRET_KEY) instead of a manual login, so this
// can be rerun any time the UI changes with zero human interaction:
//   npm run capture:help-shots
//
// Mountains/projects/proposals/contacts are client-side state (see
// DataContext.tsx — localStorage, not this Postgres DB), so there's no way
// to seed them via SQL. Instead this drives the real "Add Mountain" / "New
// Project" / etc. UI in one browser session, which both creates a realistic
// fixture AND captures the exact form a user would see.
import "../server/env";
import { chromium } from "playwright";
import { pool } from "../server/db";
import { createAuthenticatedPage } from "../server/playwright/authSession";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = "public/resource-assets/help-visuals";
const MOUNTAIN_NAME = "Sample Mountain (Help Screenshots)";

async function main() {
  const browser = await chromium.launch();
  const { page } = await createAuthenticatedPage(browser);
  const results: Record<string, "ok" | string> = {};

  const shot = async (key: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results[key] = "ok";
      console.log(`✓ ${key}`);
    } catch (err: any) {
      results[key] = err?.message ?? String(err);
      console.error(`✗ ${key}: ${results[key]}`);
    }
  };

  try {
    let mountainDetailUrl = "";

    // Idempotent: only create the fixture mountain once. Reruns (e.g. after a
    // UI change) reuse the existing sample rather than piling up duplicates.
    await page.goto(`${APP_BASE_URL}/mountains`, { waitUntil: "networkidle" });
    const alreadyExists = (await page.getByText(MOUNTAIN_NAME).count()) > 0;

    await shot("add-mountain", async () => {
      await page.goto(`${APP_BASE_URL}/mountains/new`);
      await page.getByPlaceholder("e.g., Whistler Mountain").fill(MOUNTAIN_NAME);
      await page.getByPlaceholder("Search resort name or enter address").fill("1 Sample Rd, Sample Town, VT");
      await page.keyboard.press("Escape");
      await page.locator('label:has-text("Region *") + select').selectOption("Northeast");
      if (!alreadyExists) {
        await page.getByPlaceholder("Trail name, e.g. Upper Meadow").fill("Sample Trail");
        await page.locator('input[placeholder="Trail name, e.g. Upper Meadow"] ~ button:has-text("Add")').click();
      }
      await page.screenshot({ path: `${OUT_DIR}/add-mountain.png` });
      if (!alreadyExists) {
        await page.getByRole("button", { name: "Add Mountain" }).click();
        await page.waitForURL(`${APP_BASE_URL}/`);
      }
      await page.goto(`${APP_BASE_URL}/mountains`);
      await page.getByText(MOUNTAIN_NAME).first().click();
      await page.waitForURL(/\/mountains\/[^/]+$/);
      mountainDetailUrl = page.url();
    });

    if (mountainDetailUrl) {
      await shot("action-items", async () => {
        await page.goto(mountainDetailUrl);
        await page.getByRole("button", { name: "New" }).first().click();
        await page.getByPlaceholder("Add an action item…").fill("Confirm camera install before Friday clinic");
        await page.screenshot({ path: `${OUT_DIR}/action-items.png` });
        await page.getByRole("button", { name: "Cancel" }).click();
      });

      let projectCreated = false;
      await shot("create-project", async () => {
        await page.goto(mountainDetailUrl, { waitUntil: "networkidle" });
        const projectAlreadyExists =
          (await page.getByText("Sample Install Project", { exact: true }).count()) > 0;
        await page.getByRole("heading", { name: "Projects", exact: false }).locator("xpath=..").getByRole("button", { name: "New" }).click();
        await page.getByPlaceholder("e.g. Eggbeater + Links").fill("Sample Install Project");
        await page.screenshot({ path: `${OUT_DIR}/create-project.png` });
        if (!projectAlreadyExists) {
          await page.getByRole("button", { name: "Create" }).click();
          await page.getByText("Sample Install Project", { exact: true }).first().waitFor({ timeout: 5000 });
        }
        projectCreated = true;
      });

      if (projectCreated) {
        await shot("update-status", async () => {
          await page.goto(mountainDetailUrl);
          await page.getByText("Sample Install Project", { exact: true }).first().click();
          await page.getByText("Stage", { exact: false }).first().waitFor({ timeout: 5000 });
          await page.screenshot({ path: `${OUT_DIR}/update-status.png` });
        });

        await shot("create-proposal", async () => {
          await page.goto(mountainDetailUrl, { waitUntil: "networkidle" });
          await page.getByRole("heading", { name: "Proposals", exact: false }).locator("xpath=..").getByRole("button", { name: "New" }).click();
          await page.getByText("Sample Install Project", { exact: true }).first().waitFor({ timeout: 5000 });
          await page.screenshot({ path: `${OUT_DIR}/create-proposal.png` });

          // Idempotent: only the first run actually creates a proposal for the
          // sample project. Reruns find it already has one and open that
          // existing proposal instead of trying (and failing) to make another.
          const canCreateNew = (await page.getByText("Every project already has a proposal.").count()) === 0;
          if (canCreateNew) {
            // Scoped to the open modal — an unscoped match also hits the
            // Sample Install Project card on the page behind it, and clicking
            // that (invisible-but-"visible") gets blocked by the modal itself.
            await page.getByRole("heading", { name: "New proposal" }).locator("xpath=../..").getByText("Sample Install Project", { exact: true }).click();
          } else {
            await page.goto(mountainDetailUrl, { waitUntil: "networkidle" }); // fresh load closes the modal
            // Scoped to the Proposals pane — an unscoped match also hits the
            // Sample Install Project card in the Projects pane above it.
            await page
              .getByRole("heading", { name: "Proposals", exact: false })
              .locator("xpath=../..")
              .getByRole("button", { name: /Sample Install Project/ })
              .first()
              .click();
          }
          await page.waitForURL(/\/proposal\//, { timeout: 10000 });
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${OUT_DIR}/create-proposal-builder.png` });
        });
      }

      // Two steps: (1) the trail page with "Add Assessment" highlighted, (2)
      // the workspace with every toolbar icon highlighted. boundingBox() is
      // read at the fixed 1400x900 capture viewport and printed as a % of it,
      // so the numbers can be hand-transcribed straight into helpVisuals.ts
      // as highlight coordinates that stay accurate at any display size.
      const printHighlight = async (screenshotKey: string, label: string, box: { x: number; y: number; width: number; height: number } | null) => {
        if (!box) { console.log(`[HIGHLIGHT] ${screenshotKey} "${label}": not found`); return; }
        const pct = (v: number, dim: number) => ((v / dim) * 100).toFixed(2);
        console.log(
          `[HIGHLIGHT] ${screenshotKey} "${label}": xPct=${pct(box.x, 1400)} yPct=${pct(box.y, 900)} wPct=${pct(box.width, 1400)} hPct=${pct(box.height, 900)}`
        );
      };

      await shot("site-assessment", async () => {
        await page.goto(mountainDetailUrl, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /Sample Trail/ }).click();
        const addBtn = page.getByRole("button", { name: /Add Assessment|View Assessment/ });
        await addBtn.waitFor({ timeout: 5000 });
        await page.screenshot({ path: `${OUT_DIR}/site-assessment-trail.png` });
        await printHighlight("site-assessment-trail", "Add Assessment", await addBtn.boundingBox());

        await addBtn.click();
        await page.waitForURL(/\/site-assessments\//, { timeout: 10000 });
        await page.waitForTimeout(1500); // map/workspace render
        await page.screenshot({ path: `${OUT_DIR}/site-assessment-toolbar.png` });

        const toolbarTitles = [
          "Select",
          "Add Camera",
          "Add Server",
          "Add Network Device",
          "Add Power Source",
          "Add Building",
          "Add Miscellaneous",
          "Add Start/Finish",
          "Measure distance (terrain-aware)",
        ];
        for (const title of toolbarTitles) {
          const box = await page.getByTitle(title, { exact: true }).boundingBox().catch(() => null);
          await printHighlight("site-assessment-toolbar", title, box);
        }
      });
    }

    await shot("add-contact", async () => {
      await page.goto(`${APP_BASE_URL}/crm`);
      await page.getByRole("button", { name: "Add" }).first().click();
      await page.locator('label:has-text("First Name *") + input').fill("Sam");
      await page.locator('label:has-text("Last Name *") + input').fill("Sample");
      await page.locator('label:has-text("Email *") + input').fill("sam.sample@example.com");
      await page.screenshot({ path: `${OUT_DIR}/add-contact.png` });
      await page.getByRole("button", { name: "Cancel" }).click();
    });
  } finally {
    await browser.close();
    await pool.end();
  }

  console.log("\nSummary:");
  for (const [key, val] of Object.entries(results)) console.log(`  ${key}: ${val}`);
  const failed = Object.values(results).filter((v) => v !== "ok").length;
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
