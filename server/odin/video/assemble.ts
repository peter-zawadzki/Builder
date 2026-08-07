// Muxes the intro/per-step/outro ElevenLabs narration clips onto the
// Playwright-recorded screen capture and transcodes to mp4. Placement uses
// OBSERVED timestamps from the real recording run (runner.ts's
// runManifestRecorded + recordingStart), not planned TTS-duration pacing —
// plan pacing from TTS duration, sync placement from what actually happened
// on screen.
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface TimedClip {
  filePath: string | null; // null = no audio to place (silent step)
  startMs: number;
}

export interface AssembleInput {
  videoPath: string; // .webm from Playwright's recordVideo
  clips: TimedClip[]; // intro + steps + outro, already resolved to absolute offsets by the caller
  outPath: string; // .mp4
}

export function probeDurationMs(filePath: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolvePromise(Math.round((data.format.duration ?? 0) * 1000));
    });
  });
}

export async function assembleVideo(input: AssembleInput): Promise<{ durationMs: number }> {
  const audioClips = input.clips.filter((c): c is TimedClip & { filePath: string } => !!c.filePath);

  await new Promise<void>((resolvePromise, reject) => {
    const cmd = ffmpeg(input.videoPath);

    if (audioClips.length === 0) {
      // No narration at all — shouldn't normally happen, but transcode
      // straight through rather than fail the whole pipeline over it.
      cmd
        .videoCodec("libx264")
        .noAudio()
        .output(input.outPath)
        .on("end", () => resolvePromise())
        .on("error", reject)
        .run();
      return;
    }

    audioClips.forEach((c) => cmd.input(c.filePath));
    const delayed = audioClips.map((c, i) => `[${i + 1}:a]adelay=${c.startMs}:all=1[a${i}]`);
    const mixInputs = audioClips.map((_, i) => `[a${i}]`).join("");
    // duration=longest: the mix spans whichever delayed clip finishes last,
    // not just the first — video is never truncated to match audio (no
    // -shortest), so the recording plays out in full even after narration ends.
    // normalize=0 is the important part: amix's default (normalize=1) divides
    // every input's volume by the TOTAL clip count regardless of how many are
    // actually sounding at a given moment — since these clips are time-
    // separated (delayed, non-overlapping), that produces inconsistent,
    // unpredictable loudness across the timeline rather than each clip
    // playing at its own natural volume. With this many non-overlapping
    // clips summed, disabling normalization is correct, not just safe.
    const filterComplex = `${delayed.join(";")};${mixInputs}amix=inputs=${audioClips.length}:duration=longest:dropout_transition=0:normalize=0[aout]`;

    cmd
      .complexFilter(filterComplex)
      .outputOptions(["-map", "0:v", "-map", "[aout]"])
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-movflags", "+faststart"])
      .output(input.outPath)
      .on("end", () => resolvePromise())
      .on("error", reject)
      .run();
  });

  const durationMs = await probeDurationMs(input.outPath);
  return { durationMs };
}
