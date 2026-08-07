// Builds the branded open/close bumper segments for a video tutorial: the
// Square Orange YULLR logo (server/data/logoAssets.ts's "square-orange"
// entry — public/resource-assets/logos/Square_Orange/) centered on a white
// canvas, with the intro/outro narration playing over it instead of over
// the live app recording, then concatenated around the main screen capture.
import { resolve } from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const REPO_ROOT = resolve(process.cwd());
export const LOGO_PATH = resolve(REPO_ROOT, "public/resource-assets/logos/Square_Orange/yullr_logo_square_text_orange.png");

const MIN_BUMPER_MS = 2000;
const BUMPER_TAIL_BUFFER_MS = 300; // headroom so the audio never gets cut by the video's own -t cutoff

export interface BumperInput {
  audioPath: string;
  audioDurationMs: number;
  size: { width: number; height: number };
  outPath: string;
}

export async function buildLogoBumper(input: BumperInput): Promise<void> {
  const durationSec = Math.max(MIN_BUMPER_MS, input.audioDurationMs + BUMPER_TAIL_BUFFER_MS) / 1000;
  const { width, height } = input.size;
  const logoTargetHeight = Math.round(height * 0.35);

  await new Promise<void>((resolvePromise, reject) => {
    ffmpeg()
      .input(`color=c=white:s=${width}x${height}:d=${durationSec}`)
      .inputOptions(["-f", "lavfi"])
      .input(LOGO_PATH)
      .inputOptions(["-loop", "1"])
      .input(input.audioPath)
      .complexFilter([`[1:v]scale=-1:${logoTargetHeight}[logo]`, `[0:v][logo]overlay=(W-w)/2:(H-h)/2[outv]`])
      .outputOptions(["-map", "[outv]", "-map", "2:a", "-t", String(durationSec), "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p"])
      .output(input.outPath)
      .on("end", () => resolvePromise())
      .on("error", reject)
      .run();
  });
}

export async function concatSegments(segmentPaths: string[], outPath: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const cmd = ffmpeg();
    segmentPaths.forEach((p) => cmd.input(p));
    const streamRefs = segmentPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
    cmd
      .complexFilter(`${streamRefs}concat=n=${segmentPaths.length}:v=1:a=1[outv][outa]`)
      .outputOptions(["-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"])
      .output(outPath)
      .on("end", () => resolvePromise())
      .on("error", reject)
      .run();
  });
}
