// Orchestrates a single ODIN video generation end to end: manifest -> dry
// run -> narration+TTS -> paced recording run -> ffmpeg assembly -> S3
// upload -> notification. Concurrency is deduped at two levels: the DB-level
// UNIQUE constraint on odin_videos (claimVideoJob) so two simultaneous
// first-time requests for the same {flow, detail level, ...} only trigger
// one job, and an in-process counter here capping total simultaneous
// pipeline runs (headless Chromium + ffmpeg encoding is heavy for the small
// prod box this also serves live traffic from).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { query, queryOne } from "../../db";
import { putObject } from "../../s3";
import { ODIN_VIDEO_FLOWS } from "../../data/odinVideoFlows";
import { createAuthenticatedPage } from "../../playwright/authSession";
import { getOrGenerateManifest, type ManifestStep } from "./manifestGenerator";
import { runManifestDry, runManifestRecorded, CURSOR_OVERLAY_SCRIPT } from "./runner";
import { generateNarration } from "./narration";
import { synthesizeNarrationClips } from "./tts";
import { assembleVideo, probeDurationMs, type TimedClip } from "./assemble";
import { buildLogoBumper, concatSegments } from "./bumper";

const RECORD_SIZE = { width: 1400, height: 900 };

export interface VideoCacheKey {
  flowKey: string;
  detailLevel: number;
  sourceHash: string;
  scriptVersion: string;
  voiceId: string;
  userId: string | null;
}

export async function claimVideoJob(key: VideoCacheKey): Promise<{ id: string; claimed: boolean; status?: string }> {
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO odin_videos (flow_key, detail_level, source_hash, script_version, voice_id, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (flow_key, detail_level, source_hash, script_version, voice_id) DO NOTHING
     RETURNING id`,
    [key.flowKey, key.detailLevel, key.sourceHash, key.scriptVersion, key.voiceId, key.userId]
  );
  if (inserted) return { id: inserted.id, claimed: true };

  const existing = await queryOne<{ id: string; status: string; updated_at: string }>(
    `SELECT id, status, updated_at FROM odin_videos
     WHERE flow_key=$1 AND detail_level=$2 AND source_hash=$3 AND script_version=$4 AND voice_id=$5`,
    [key.flowKey, key.detailLevel, key.sourceHash, key.scriptVersion, key.voiceId]
  );
  if (!existing) throw new Error("Video row vanished between claim attempt and read-back");

  // A "generating" row whose heartbeat has gone stale (>3min) is almost
  // certainly orphaned by a process that died mid-job — no supervisor
  // exists to detect that any other way. Re-claim and restart from scratch
  // rather than resuming (partial temp/S3 state isn't worth the complexity
  // for a one-flow MVP).
  if (existing.status === "generating") {
    const reclaimed = await queryOne<{ id: string }>(
      `UPDATE odin_videos SET status='generating', updated_at=now(), error=NULL
       WHERE id=$1 AND status='generating' AND updated_at < now() - interval '3 minutes'
       RETURNING id`,
      [existing.id]
    );
    if (reclaimed) return { id: reclaimed.id, claimed: true };
  }
  return { id: existing.id, claimed: false, status: existing.status };
}

async function touch(videoId: string): Promise<void> {
  await query(`UPDATE odin_videos SET updated_at=now() WHERE id=$1`, [videoId]);
}

async function insertOdinNotification(userId: string, kind: "video_ready" | "video_failed", videoId: string, text: string): Promise<void> {
  await query(`INSERT INTO odin_notifications (user_id, kind, video_id, text) VALUES ($1, $2, $3, $4)`, [userId, kind, videoId, text]);
}

async function cleanupFixture(flowKey: string): Promise<void> {
  const flow = ODIN_VIDEO_FLOWS[flowKey];
  await flow?.cleanup?.();
}

let running = 0;
const MAX_CONCURRENT = 1;

export function runVideoPipeline(videoId: string, flowKey: string, detailLevel: number, voiceId: string, userId: string): void {
  if (running >= MAX_CONCURRENT) {
    setTimeout(() => runVideoPipeline(videoId, flowKey, detailLevel, voiceId, userId), 5000);
    return;
  }
  running++;
  executePipeline(videoId, flowKey, detailLevel, voiceId, userId)
    .catch(async (err) => {
      const message = err?.message ?? String(err);
      await query(`UPDATE odin_videos SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [videoId, message]);
      await insertOdinNotification(userId, "video_failed", videoId, `Video generation for "${flowKey}" failed — ask ODIN again to retry.`);
    })
    .finally(() => {
      running--;
    });
}

async function executePipeline(videoId: string, flowKey: string, detailLevel: number, voiceId: string, userId: string): Promise<void> {
  const flow = ODIN_VIDEO_FLOWS[flowKey];
  if (!flow) throw new Error(`Unknown flow: ${flowKey}`);

  await touch(videoId);
  const { id: manifestId, steps } = await getOrGenerateManifest(flowKey);
  await query(`UPDATE odin_videos SET manifest_id=$2, updated_at=now() WHERE id=$1`, [videoId, manifestId]);

  const tmpDir = await mkdtemp(join(tmpdir(), `odin-video-${videoId}-`));
  const browser = await chromium.launch();
  try {
    // 1. Dry run — the only safety net before ever recording. Any
    // locator/action failure here fails generation gracefully with a clear
    // error instead of producing a broken video.
    await touch(videoId);
    {
      const { context, page } = await createAuthenticatedPage(browser, { suppressActivityLogging: true });
      try {
        await runManifestDry(page, steps);
      } finally {
        await context.close();
        await cleanupFixture(flowKey);
      }
    }

    // 2. Narration + TTS — generated BEFORE the real run so pacing can be
    // sized to each step's actual clip length (never bleeds into the next
    // step's visual). Intro/outro are separate beats, not tied to any step.
    await touch(videoId);
    const script = await generateNarration(steps, detailLevel);
    const narration = await synthesizeNarrationClips(script, voiceId, join(tmpDir, "audio"));

    // 3. Real (paced, cursor-overlay) recording run. recordingStart comes
    // from context/page creation (authSession.ts) — Playwright's recordVideo
    // starts capturing there, before the sign-in redirect even runs, so
    // using a fresh Date.now() here would silently shift every audio
    // placement late relative to the video's real timeline. Intro/outro no
    // longer hold on the live app — they play over their own branded logo
    // bumpers (built below), so the recording runs straight through with no
    // dead-air padding at either end.
    await touch(videoId);
    let videoPath: string | undefined;
    let stepOffsets: { stepIndex: number; startMs: number }[] = [];
    {
      const { context, page, recordingStart } = await createAuthenticatedPage(browser, {
        recordVideo: { dir: join(tmpDir, "video"), size: RECORD_SIZE },
        initScript: CURSOR_OVERLAY_SCRIPT,
        suppressActivityLogging: true,
      });
      try {
        const result = await runManifestRecorded(page, steps, narration.steps.map((c) => c.durationMs), recordingStart, 0);
        stepOffsets = result.stepOffsets;
        videoPath = (await page.video()?.path()) ?? undefined;
      } finally {
        await context.close();
        await cleanupFixture(flowKey);
      }
    }
    if (!videoPath) throw new Error("Recording run produced no video file");

    // 4. Assemble the middle (screen recording + per-step narration) segment,
    // build the opening/closing YULLR logo bumpers (Square Orange, per
    // server/odin/video/bumper.ts), and concatenate bumper + main + bumper
    // into the final deliverable.
    await touch(videoId);
    const middlePath = join(tmpDir, "middle.mp4");
    const timedClips: TimedClip[] = narration.steps.map((c) => ({
      filePath: c.filePath,
      startMs: stepOffsets.find((o) => o.stepIndex === c.stepIndex)?.startMs ?? 0,
    }));
    await assembleVideo({ videoPath, clips: timedClips, outPath: middlePath });

    const openingPath = join(tmpDir, "opening.mp4");
    const closingPath = join(tmpDir, "closing.mp4");
    await buildLogoBumper({
      audioPath: narration.intro.filePath,
      audioDurationMs: narration.intro.durationMs,
      size: RECORD_SIZE,
      outPath: openingPath,
    });
    await buildLogoBumper({
      audioPath: narration.outro.filePath,
      audioDurationMs: narration.outro.durationMs,
      size: RECORD_SIZE,
      outPath: closingPath,
    });

    const outPath = join(tmpDir, "final.mp4");
    await concatSegments([openingPath, middlePath, closingPath], outPath);
    const durationMs = await probeDurationMs(outPath);

    await touch(videoId);
    const s3Key = `odin-videos/${videoId}.mp4`;
    const { readFile } = await import("node:fs/promises");
    await putObject(s3Key, await readFile(outPath), "video/mp4");

    await query(
      `UPDATE odin_videos SET status='ready', s3_key=$2, duration_ms=$3, step_offsets=$4, updated_at=now() WHERE id=$1`,
      [videoId, s3Key, durationMs, JSON.stringify(stepOffsets)]
    );
    await insertOdinNotification(userId, "video_ready", videoId, `Your "${flow.label}" video tutorial is ready.`);
  } finally {
    await browser.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
}
