import { useState } from 'react';
import { Video, Loader2 } from 'lucide-react';
import { useApi } from '../api/client';

type OfferState = 'ask' | 'pickLevel' | 'requesting' | 'ready' | 'generating' | 'error';

const DETAIL_LEVELS = [
  { level: 1, label: 'Quick overview' },
  { level: 2, label: 'Major steps' },
  { level: 3, label: 'Most steps' },
  { level: 4, label: 'Detailed' },
  { level: 5, label: 'Every click' },
];

// Rendered inline in a chat bubble when the backend's provide_answer flow
// matched a flow with a real generated-video manifest available (see
// faqAgent.ts's videoOffer detection, gated to server/data/odinVideoFlows.ts's
// whitelist — never offered for a flow with no manifest).
export function OdinVideoOffer({ flowKey, label }: { flowKey: string; label: string }) {
  const api = useApi();
  const [state, setState] = useState<OfferState>('ask');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickLevel(level: number) {
    setState('requesting');
    try {
      const result = await api.requestOdinVideo(flowKey, level);
      if (result.status === 'ready') {
        const video = await api.getOdinVideo(result.id);
        if (video.status === 'ready' && video.videoUrl) {
          setVideoUrl(video.videoUrl);
          setState('ready');
          return;
        }
      }
      setState('generating');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong requesting the video.');
      setState('error');
    }
  }

  if (state === 'ask') {
    return (
      <div className="mt-2 flex items-center gap-2">
        <p className="text-[12px] text-[#6a7282]">Want a short video tutorial for this?</p>
        <button
          onClick={() => setState('pickLevel')}
          className="flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[#307fe2] text-white text-[11px] font-['Inter:Medium',sans-serif]"
        >
          <Video size={12} /> Yes
        </button>
      </div>
    );
  }

  if (state === 'pickLevel') {
    return (
      <div className="mt-2">
        <p className="text-[12px] text-[#6a7282] mb-1.5">How detailed would you like it?</p>
        <div className="flex flex-wrap gap-1.5">
          {DETAIL_LEVELS.map(d => (
            <button
              key={d.level}
              onClick={() => pickLevel(d.level)}
              className="px-2 py-1 rounded-[6px] bg-white border border-[rgba(0,0,0,0.1)] text-[11px] text-[#0a0a0a] hover:border-[#307fe2]"
            >
              {d.level} — {d.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (state === 'requesting') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#6a7282]">
        <Loader2 size={12} className="animate-spin" /> Checking for an existing video…
      </div>
    );
  }

  if (state === 'ready' && videoUrl) {
    return (
      <div className="mt-2 space-y-1.5">
        <video src={videoUrl} controls className="w-full rounded-[8px] border border-[rgba(0,0,0,0.08)]" />
        <a href={videoUrl} download className="text-[11px] text-[#307fe2]">Download video</a>
      </div>
    );
  }

  if (state === 'generating') {
    return (
      <p className="mt-2 text-[12px] text-[#6a7282]">
        On it — this takes a few minutes to put together. You'll get a notification in the bell icon up top when the "{label}" video is ready, so feel free to keep working in the meantime.
      </p>
    );
  }

  return <p className="mt-2 text-[12px] text-[#b45309]">{error ?? "Couldn't request that video — try again."}</p>;
}
