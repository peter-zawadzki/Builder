// Shared, persistent fixture data for ODIN video flows that are nested
// under an existing mountain/project/trail (inventory, projects, proposals,
// trail assessments, notes) rather than standalone like "Add a Mountain".
// Created once via direct DB insert (idempotent — checked by name before
// creating), reused by every future generation, NEVER deleted — distinct
// from the "Add a Mountain" flow's own Mount Tom fixture, which is
// create-then-delete every run since demonstrating creation is the point of
// that video. Bypasses the real UI entirely (raw SQL, not Playwright), so
// there's no client-side activity logging/Slack mirror to worry about here.
import { queryOne, query } from "../../db";

export const FIXTURE_MOUNTAIN_NAME = "YULLR Demo Mountain (Video Tutorials)";
export const FIXTURE_PROJECT_NAME = "YULLR Demo Project (Video Tutorials)";
export const FIXTURE_TRAIL_NAME = "YULLR Demo Trail (Video Tutorials)";

export interface SharedFixtures {
  mountainId: string;
  projectId: string;
  trailId: string;
}

async function ensureMountain(): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM legacy_records WHERE collection='mountains' AND data->>'name' = $1`,
    [FIXTURE_MOUNTAIN_NAME]
  );
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const record = {
    id,
    name: FIXTURE_MOUNTAIN_NAME,
    address: "1 Demo Mountain Rd, Waterbury, VT",
    phone: "",
    website: "",
    region: "Northeast",
    notes: "Persistent fixture for ODIN video-tutorial generation — do not delete or archive.",
    adminContact: { name: "", email: "", phone: "", notes: "" },
    technicalContact: { name: "", email: "", phone: "", notes: "" },
    additionalContacts: [],
    activities: [],
  };
  await query(`INSERT INTO legacy_records (collection, id, data, updated_at) VALUES ('mountains', $1, $2::jsonb, now())`, [
    id,
    JSON.stringify(record),
  ]);
  return id;
}

async function ensureProject(mountainId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM legacy_records WHERE collection='projects' AND data->>'name' = $1`,
    [FIXTURE_PROJECT_NAME]
  );
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = {
    id,
    mountainId,
    name: FIXTURE_PROJECT_NAME,
    notes: "Persistent fixture for ODIN video-tutorial generation — do not delete.",
    type: "Install",
    stageStatus: {},
    stageDates: {},
    createdAt: now,
    updatedAt: now,
  };
  await query(`INSERT INTO legacy_records (collection, id, data, updated_at) VALUES ('projects', $1, $2::jsonb, now())`, [
    id,
    JSON.stringify(record),
  ]);
  return id;
}

async function ensureTrail(mountainId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM legacy_records WHERE collection='trails' AND data->>'name' = $1`,
    [FIXTURE_TRAIL_NAME]
  );
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const record = {
    id,
    mountainId,
    name: FIXTURE_TRAIL_NAME,
    notes: "Persistent fixture for ODIN video-tutorial generation — do not delete.",
  };
  await query(`INSERT INTO legacy_records (collection, id, data, updated_at) VALUES ('trails', $1, $2::jsonb, now())`, [
    id,
    JSON.stringify(record),
  ]);
  return id;
}

export async function ensureSharedFixtures(): Promise<SharedFixtures> {
  const mountainId = await ensureMountain();
  const [projectId, trailId] = await Promise.all([ensureProject(mountainId), ensureTrail(mountainId)]);
  return { mountainId, projectId, trailId };
}

// create-proposal reuses the shared fixture project every time (never
// creates a second one), but must never find an EXISTING proposal already
// attached — ProposalsPane only offers projects from `projectsWithoutProposal`.
// Call this before each proposal-flow generation so the fixture project is
// always eligible again.
export async function clearFixtureProposal(): Promise<void> {
  const project = await queryOne<{ id: string }>(`SELECT id FROM legacy_records WHERE collection='projects' AND data->>'name' = $1`, [
    FIXTURE_PROJECT_NAME,
  ]);
  if (!project) return;
  await query(`DELETE FROM legacy_records WHERE collection='proposals' AND data->>'projectId' = $1`, [project.id]);
}
