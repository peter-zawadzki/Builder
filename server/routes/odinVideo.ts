import { Hono } from "hono";
import type { HonoEnv } from "../auth";
import { query, queryOne } from "../db";
import { getSignedGetUrl } from "../s3";
import { ODIN_VIDEO_FLOWS } from "../data/odinVideoFlows";
import { hashFlowSource } from "../odin/video/manifestGenerator";
import { SCRIPT_VERSION } from "../odin/video/narration";
import { claimVideoJob, runVideoPipeline } from "../odin/video/pipeline";

export const odinVideo = new Hono<HonoEnv>();

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "";

odinVideo.post("/request", async (c) => {
  const body = await c.req.json<{ flowKey?: string; detailLevel?: number }>();
  const flowKey = body.flowKey;
  const detailLevel = body.detailLevel;
  if (!flowKey || !ODIN_VIDEO_FLOWS[flowKey]) {
    return c.json({ error: "Unknown or unsupported flow — video generation isn't available for this yet." }, 400);
  }
  if (!detailLevel || detailLevel < 1 || detailLevel > 5) {
    return c.json({ error: "detailLevel must be between 1 and 5" }, 400);
  }
  if (!VOICE_ID) return c.json({ error: "ELEVENLABS_VOICE_ID not configured" }, 500);

  const user = c.get("user");
  const sourceHash = await hashFlowSource(flowKey);
  const result = await claimVideoJob({
    flowKey,
    detailLevel,
    sourceHash,
    scriptVersion: SCRIPT_VERSION,
    voiceId: VOICE_ID,
    userId: user.id,
  });

  if (result.claimed) {
    runVideoPipeline(result.id, flowKey, detailLevel, VOICE_ID, user.id);
    return c.json({ id: result.id, status: "generating" });
  }
  return c.json({ id: result.id, status: result.status ?? "generating" });
});

// Static paths registered BEFORE "/:id" — otherwise Hono matches
// "/notifications" against the "/:id" pattern first (id="notifications"),
// which then fails as an invalid UUID at the database.
odinVideo.get("/", async (c) => {
  const rows = await query<{ id: string; flow_key: string; detail_level: number; duration_ms: number | null; created_at: string }>(
    `SELECT id, flow_key, detail_level, duration_ms, created_at FROM odin_videos WHERE status='ready' ORDER BY created_at DESC`
  );
  return c.json({
    videos: rows.map((r) => ({
      id: r.id,
      flowKey: r.flow_key,
      label: ODIN_VIDEO_FLOWS[r.flow_key]?.label ?? r.flow_key,
      detailLevel: r.detail_level,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    })),
  });
});

odinVideo.get("/notifications", async (c) => {
  const user = c.get("user");
  const rows = await query<{ id: string; kind: string; video_id: string; text: string; created_at: string }>(
    `SELECT id, kind, video_id, text, created_at FROM odin_notifications
     WHERE user_id=$1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`,
    [user.id]
  );
  return c.json({ notifications: rows.map((r) => ({ id: r.id, kind: r.kind, videoId: r.video_id, text: r.text, createdAt: r.created_at })) });
});

odinVideo.post("/notifications/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await query(`UPDATE odin_notifications SET read_at=now() WHERE id=$1 AND user_id=$2`, [id, user.id]);
  return c.json({ ok: true });
});

odinVideo.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await queryOne<{
    id: string;
    flow_key: string;
    detail_level: number;
    status: string;
    s3_key: string | null;
    duration_ms: number | null;
    error: string | null;
  }>(`SELECT id, flow_key, detail_level, status, s3_key, duration_ms, error FROM odin_videos WHERE id=$1`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);

  const videoUrl = row.s3_key ? await getSignedGetUrl(row.s3_key) : null;
  return c.json({
    id: row.id,
    flowKey: row.flow_key,
    detailLevel: row.detail_level,
    status: row.status,
    videoUrl,
    durationMs: row.duration_ms,
    error: row.error,
  });
});
