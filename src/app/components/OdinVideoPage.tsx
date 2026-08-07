import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useApi } from '../api/client';
import type { OdinVideoResult } from '../api/client';

const POLL_INTERVAL_MS = 5000;

// Reached either directly (cache-hit chat offer already had the url) or via
// a "your video is ready" notification click — polls while generating so a
// notification-driven visit lands on a live view, not a stale snapshot.
export function OdinVideoPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const [video, setVideo] = useState<OdinVideoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const result = await api.getOdinVideo(videoId!);
        if (cancelled) return;
        setVideo(result);
        if (result.status === 'generating') timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Could not load this video.');
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [videoId, api]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[13px] text-[#6a7282] mb-4">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="text-[18px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mb-4">Video tutorial</h1>

      {error && (
        <div className="flex items-center gap-2 text-[13px] text-[#b45309]">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {!error && !video && (
        <div className="flex items-center gap-2 text-[13px] text-[#6a7282]">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      )}

      {video?.status === 'generating' && (
        <div className="flex items-center gap-2 text-[13px] text-[#6a7282]">
          <Loader2 size={15} className="animate-spin" /> Still putting this together — checking again shortly.
        </div>
      )}

      {video?.status === 'failed' && (
        <div className="flex items-center gap-2 text-[13px] text-[#b45309]">
          <AlertTriangle size={15} /> {video.error ?? 'Generation failed.'} Ask ODIN again to retry.
        </div>
      )}

      {video?.status === 'ready' && video.videoUrl && (
        <div className="space-y-2">
          <video src={video.videoUrl} controls autoPlay className="w-full rounded-[10px] border border-[rgba(0,0,0,0.08)]" />
          <a href={video.videoUrl} download className="text-[13px] text-[#307fe2]">Download video</a>
        </div>
      )}
    </div>
  );
}
