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
    const n = audioClips.length;
    // Force every clip to the same known format (stereo/44.1kHz) before
    // delaying it — adelay's delay list must match the channel count
    // exactly, and clips can otherwise vary (mono vs stereo) depending on
    // what ElevenLabs returned. This build's adelay has no "all=1" shorthand
    // (older ffmpeg static binary on the arm64 prod host — verified via
    // `ffmpeg -h filter=adelay`, which only lists a bare "delays" option),
    // so both channels are always specified explicitly.
    const delayed = audioClips.map(
      (c, i) => `[${i + 1}:a]aformat=channel_layouts=stereo,adelay=${c.startMs}|${c.startMs}[d${i}]`
    );
    // This build's amix also has no "normalize" option (same older static
    // binary — `ffmpeg -h filter=amix` lists only inputs/duration/
    // dropout_transition/weights) — amix here ALWAYS divides the mixed sum
    // by the input count, unconditionally. Since these clips are time-
    // separated (delayed, non-overlapping) rather than actually overlapping,
    // that division would quietly attenuate every clip by 1/n. Countered by
    // pre-boosting each delayed clip by exactly n before mixing, canceling
    // the built-in division out — works identically on old and new ffmpeg,
    // unlike relying on an option this binary doesn't have.
    const boosted = audioClips.map((_, i) => `[d${i}]volume=${n}[a${i}]`);
    const mixInputs = audioClips.map((_, i) => `[a${i}]`).join("");
    // duration=longest: the mix spans whichever delayed clip finishes last,
    // not just the first — video is never truncated to match audio (no
    // -shortest), so the recording plays out in full even after narration ends.
    const filterComplex = `${delayed.join(";")};${boosted.join(";")};${mixInputs}amix=inputs=${n}:duration=longest:dropout_transition=0[aout]`;

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
