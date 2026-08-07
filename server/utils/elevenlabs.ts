// ElevenLabs TTS for ODIN video narration — raw fetch, matching the house
// style already used for server/utils/googlePlaces.ts (no SDK needed for a
// single synthesize call per step).
const API_BASE = "https://api.elevenlabs.io/v1";

// ElevenLabs mispronounces "YULLR" — respell it phonetically for the TTS
// input only. Never applied to script text stored/displayed anywhere else,
// so the brand name still reads correctly in the DB record, UI, etc.
function forPronunciation(text: string): string {
  return text.replace(/\bYULLR\b/gi, "Yooler");
}

export interface VoiceSettings {
  stability: number; // 0-1
  similarityBoost: number; // 0-1
  speed: number; // ElevenLabs' supported range is ~0.7-1.2
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  // Eleven v3 treats stability as roughly three semantic bands rather than
  // a plain slider: low = "Creative" (expressive, but ElevenLabs' own docs
  // warn it's more prone to hallucinating words not in the input), ~0.5 =
  // "Natural", high = "Robust"/monotone. Leaning creative per request,
  // short of the riskiest low end.
  stability: 0.3,
  similarityBoost: 0.6,
  speed: 1,
};

export async function synthesize(
  text: string,
  voiceId: string,
  settings: VoiceSettings = DEFAULT_VOICE_SETTINGS
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const resp = await fetch(`${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({
      text: forPronunciation(text),
      // eleven_v3 is ElevenLabs' newest and most expressive model — worth
      // the extra generation time for a handful of short per-step clips.
      // Needs a paid plan for Voice Library voices like Katie; confirmed
      // working directly against this account after the upgrade.
      model_id: "eleven_v3",
      voice_settings: {
        stability: settings.stability,
        similarity_boost: settings.similarityBoost,
        speed: settings.speed,
      },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`ElevenLabs TTS error (${resp.status}): ${errText}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}
