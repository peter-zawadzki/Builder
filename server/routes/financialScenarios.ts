// Backs the Financial Planning tool's Scenario Library (save/load a set of
// model overrides) — folded in from a standalone Next.js/Prisma app, see
// db/migrations/0038_financial_scenarios.sql for why this is one table
// instead of the original 11. Admin/Super Admin only, matching the
// Financial Planning menu item's gating in AppHeader.tsx.
import { Hono } from "hono";
import { requireAdmin, type HonoEnv } from "../auth";
import { query, queryOne } from "../db";

export const financialScenarios = new Hono<HonoEnv>();

interface ScenarioRow {
  id: string;
  name: string;
  description: string | null;
  override_count: number;
  results_json: { annual?: Record<string, { totalRevenue?: number; revenueGeneratingAreas?: number }> } | null;
  created_at: string;
}

financialScenarios.get("/", requireAdmin, async (c) => {
  const rows = await query<ScenarioRow>(
    `SELECT id, name, description, override_count, results_json, created_at
       FROM financial_scenarios WHERE is_archived = false ORDER BY created_at DESC`
  );
  const scenarios = rows.map((r) => {
    const fy2930 = r.results_json?.annual?.["FY29/30"];
    return {
      id: r.id,
      name: r.name,
      comments: r.description,
      createdAt: r.created_at,
      overrideCount: r.override_count,
      fy2930Revenue: fy2930?.totalRevenue ?? null,
      fy2930Resorts: fy2930?.revenueGeneratingAreas ?? null,
    };
  });
  return c.json({ scenarios });
});

financialScenarios.post("/", requireAdmin, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Scenario name is required." }, 400);

  const overrides = body?.overrides ?? {};
  const overrideCount = typeof body?.overrideCount === "number" ? body.overrideCount : 0;
  const annual = body?.annual ?? null;
  const description = typeof body?.comments === "string" && body.comments.trim() ? body.comments.trim() : null;
  const growthPreset = typeof overrides?.growthPreset === "string" ? overrides.growthPreset : null;
  const adoptionPreset = typeof overrides?.adoptionPreset === "string" ? overrides.adoptionPreset : null;
  const engineVersion = typeof body?.engineVersion === "string" ? body.engineVersion : "unknown";

  const scenario = await queryOne<{ id: string }>(
    `INSERT INTO financial_scenarios
       (name, description, growth_preset, adoption_preset, overrides_json, override_count, results_json, engine_version, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      name,
      description,
      growthPreset,
      adoptionPreset,
      JSON.stringify(overrides),
      overrideCount,
      annual ? JSON.stringify({ annual }) : null,
      engineVersion,
      user.id,
    ]
  );
  return c.json({ scenario }, 201);
});

financialScenarios.get("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const row = await queryOne<{ id: string; name: string; overrides_json: unknown }>(
    `SELECT id, name, overrides_json FROM financial_scenarios WHERE id = $1`,
    [id]
  );
  if (!row) return c.json({ error: "Scenario not found." }, 404);
  return c.json({ scenario: { id: row.id, name: row.name, overrides: row.overrides_json } });
});
