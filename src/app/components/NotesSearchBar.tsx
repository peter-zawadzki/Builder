import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Loader2 } from 'lucide-react';
import { useApi } from '../api/client';
import type { NoteSearchResult } from '../api/client';

function resultHref(r: NoteSearchResult): string | null {
  if (!r.mountainId) return null;
  const base = `/mountains/${r.mountainId}`;
  if (r.originCollection === 'projects' && r.originId) return `${base}?openProject=${r.originId}`;
  return `${base}?highlightNote=${r.noteId}`;
}

// AI-powered (semantic) search over every note and reply — content that
// doesn't share exact keywords with the query can still surface, since this
// is a vector similarity search (server/routes/notes.ts's GET /search),
// not substring matching. Reused both mountain-scoped (MountainNotes.tsx,
// passing mountainId) and as the global cross-mountain search entry point.
export function NotesSearchBar({ mountainId }: { mountainId?: string }) {
  const api = useApi();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<NoteSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.searchNotes(q.trim(), mountainId);
      setResults(r.results);
    } catch (e: any) {
      setError(e?.message ?? 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder={mountainId ? 'Search this mountain’s notes…' : 'Search all notes…'}
          className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6a7282] animate-spin" />}
      </div>

      {error && <p className="text-[12px] text-[#b45309]">{error}</p>}

      {results !== null && (
        <div className="space-y-1.5">
          {results.length === 0 ? (
            <p className="text-[13px] text-[#6a7282] px-1">No matching notes found.</p>
          ) : (
            results.map((r) => {
              const href = resultHref(r);
              return (
                <button
                  key={`${r.noteSource}-${r.noteId}`}
                  onClick={() => href && navigate(href)}
                  disabled={!href}
                  className="w-full text-left bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-3 active:bg-[#f9fafb] disabled:cursor-default"
                >
                  <p className="text-[13px] text-[#0a0a0a]">{r.content}</p>
                  <p className="text-[11px] text-[#8992a0] mt-1">Match: {Math.round(r.score * 100)}%</p>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
