import { useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useApi } from '../api/client';
import type { NoteRef, NoteReply } from '../api/client';

// Shared reply/thread UI for a note — used wherever a note renders
// (ActivitySection, MountainNotes' NoteCard/RollupNoteRow, MountainActivityRollup).
// Collapsed by default (just a "N replies" toggle); expands to the full
// thread + a reply box. Replying notifies the note's original poster
// server-side (server/routes/notes.ts) — this component just posts the text.
export function ReplyThread({ noteRef }: { noteRef: NoteRef }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<NoteReply[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    const r = await api.listNoteReplies(noteRef);
    setReplies(r.replies);
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && replies === null) await load();
  }

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api.postNoteReply({ ...noteRef, text: draft.trim() });
      setDraft('');
      await load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-1.5">
      <button onClick={toggle} className="flex items-center gap-1 text-[11px] text-[#307fe2] active:opacity-70">
        <MessageCircle size={11} />
        {open ? 'Hide replies' : replies ? `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}` : 'Reply'}
      </button>

      {open && (
        <div className="mt-2 pl-3 border-l-2 border-[rgba(0,0,0,0.06)] space-y-2">
          {replies === null ? (
            <p className="text-[11px] text-[#8992a0]">Loading…</p>
          ) : replies.length === 0 ? (
            <p className="text-[11px] text-[#8992a0]">No replies yet.</p>
          ) : (
            replies.map((r) => (
              <div key={r.id}>
                <p className="text-[12px] text-[#0a0a0a]">{r.text}</p>
                <p className="text-[10px] text-[#8992a0]">{r.authorName} · {new Date(r.createdAt).toLocaleString()}</p>
              </div>
            ))
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Reply…"
              className="flex-1 bg-[#f3f3f5] rounded-[6px] px-2.5 py-1.5 text-[12px] outline-none"
            />
            <button
              onClick={send}
              disabled={!draft.trim() || sending}
              className="p-1.5 rounded-[6px] bg-[#1D2930] text-white disabled:opacity-40"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
