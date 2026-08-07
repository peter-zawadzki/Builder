// Synthesizes one ElevenLabs audio clip per narrated step (plus intro/outro)
// and measures each clip's duration (via ffprobe) — this happens BEFORE the
// real recording run so the paced run can dwell on each step exactly as
// long as its narration needs (see runner.ts's runManifestRecorded), rather
// than generating audio after a fixed-timing recording and hoping it fits.
import { promises as fs } from "node:fs";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { synthesize } from "../../utils/elevenlabs";
import type { NarrationScript } from "./narration";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface StepClip {
  stepIndex: number;
  filePath: string | null; // null when this step has no narration at the chosen detail level (or is a waitForURL step)
  durationMs: number; // audio duration, or a minimum silent dwell time when filePath is null
}

export interface NarrationClips {
  intro: { filePath: string; durationMs: number };
  steps: StepClip[];
  outro: { filePath: string; durationMs: number };
}

// Dwell time for an un-narrated step (low detail levels skip minor steps,
// waitForURL steps are always silent) so the recording doesn't blur past it
// faster than a viewer could follow.
const MIN_SILENT_PAUSE_MS = 600;

function probeDurationMs(filePath: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolvePromise(Math.round((data.format.duration ?? 0) * 1000));
    });
  });
}

async function synthesizeClip(text: string, voiceId: string, filePath: string): Promise<{ filePath: string; durationMs: number }> {
  const buffer = await synthesize(text, voiceId);
  await fs.writeFile(filePath, buffer);
  const durationMs = await probeDurationMs(filePath);
  return { filePath, durationMs };
}

export async function synthesizeNarrationClips(script: NarrationScript, voiceId: string, tmpDir: string): Promise<NarrationClips> {
  await fs.mkdir(tmpDir, { recursive: true });

  const intro = await synthesizeClip(script.intro, voiceId, path.join(tmpDir, "intro.mp3"));
  const outro = await synthesizeClip(script.outro, voiceId, path.join(tmpDir, "outro.mp3"));

  const steps: StepClip[] = [];
  for (const line of script.lines) {
    if (!line.text.trim()) {
      steps.push({ stepIndex: line.stepIndex, filePath: null, durationMs: MIN_SILENT_PAUSE_MS });
      continue;
    }
    const clip = await synthesizeClip(line.text, voiceId, path.join(tmpDir, `step-${line.stepIndex}.mp3`));
    steps.push({ stepIndex: line.stepIndex, filePath: clip.filePath, durationMs: clip.durationMs });
  }

  return { intro, steps, outro };
}
