import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth, useUser } from '@clerk/clerk-react';
import { X, Search } from 'lucide-react';
import { useData } from '../context/DataContext';

type Act = { id: string; mountainId: string; type: string; summary: string; actor: string; timestamp: string };

// Recent actor-stamped activity across all mountains. Master scope decides
// "my activity" (things I did) vs. everyone; in "all" you can drill to a person.
export function RecentActivity({ scope = 'all' }: { scope?: 'mine' | 'all' }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { mountains } = useData();
  const navigate = useNavigate();
  const [items, setItems] = useState<Act[]>([]);
  const [person, setPerson] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/legacy/activity', { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setItems(data.activity || []);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [getToken]);

  const myNames = [user?.fullName, user?.primaryEmailAddress?.emailAddress].filter(Boolean).map(s => s!.toLowerCase());
  const people = useMemo(
    () => Array.from(new Set(items.map(i => i.actor).filter(Boolean))).sort() as string[],
    [items],
  );
  const base = scope === 'mine' ? items.filter(i => myNames.includes((i.actor || '').toLowerCase())) : items;
  const filtered = scope === 'mine' || person === 'all' ? base : base.filter(i => i.actor === person);
  const mName = (id: string) => mountains.find(m => m.id === id)?.name;

  // "View all" modal searches across everything, ignoring the master scope.
  const searched = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      (i.summary || '').toLowerCase().includes(q) ||
      (i.actor || '').toLowerCase().includes(q) ||
      (mName(i.mountainId) || '').toLowerCase().includes(q),
    );
  }, [items, modalSearch, mountains]);

  return (
    <div className="space-y-2">
      {scope === 'all' && (
        <select
          value={person}
          onChange={e => setPerson(e.target.value)}
          className="bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] text-[#0a0a0a] outline-none"
        >
          <option value="all">Everyone</option>
          {people.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-6 text-center text-[13px] text-[#6a7282]">No activity yet.</div>
      ) : (
        <>
          <div className="space-y-2">
            {filtered.slice(0, 10).map(a => (
              <ActivityRow key={a.id} a={a} mName={mName} onClick={() => navigate(`/mountains/${a.mountainId}`)} />
            ))}
          </div>
          {filtered.length > 10 && (
            <button onClick={() => setShowAll(true)} className="w-full mt-2 text-[13px] text-[#307fe2] py-2 active:opacity-70 font-['Inter:Medium',sans-serif]">
              View all activity ({filtered.length})
            </button>
          )}
        </>
      )}

      {showAll && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { if (e.target === e.currentTarget) setShowAll(false); }}>
          <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg h-[88vh] sm:h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">All activity</h2>
              <button onClick={() => setShowAll(false)} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
            </div>
            <div className="px-5 pt-3">
              <div className="flex items-center gap-2 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5">
                <Search size={15} className="text-[#6a7282]" />
                <input autoFocus value={modalSearch} onChange={e => setModalSearch(e.target.value)} placeholder="Search activity, person, mountain…" className="flex-1 bg-transparent outline-none text-[14px] text-[#0a0a0a]" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {searched.length === 0 ? (
                <div className="text-center py-10 text-[13px] text-[#6a7282]">No matching activity.</div>
              ) : (
                searched.map(a => (
                  <ActivityRow key={a.id} a={a} mName={mName} onClick={() => { setShowAll(false); navigate(`/mountains/${a.mountainId}`); }} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ a, mName, onClick }: { a: Act; mName: (id: string) => string | undefined; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3 active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)]">
      <div className="text-[13px] text-[#0a0a0a]">{a.summary}</div>
      <div className="text-[11px] text-[#8992a0] mt-0.5">
        {a.actor}{mName(a.mountainId) ? ` · ${mName(a.mountainId)}` : ''} · {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </div>
    </button>
  );
}
