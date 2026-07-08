import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@clerk/clerk-react';
import { useData } from '../context/DataContext';

type Act = { id: string; mountainId: string; type: string; summary: string; actor: string; timestamp: string };

// Recent actor-stamped activity across all mountains, filterable by person
// ("let's see what RJ has done lately").
export function RecentActivity() {
  const { getToken } = useAuth();
  const { mountains } = useData();
  const navigate = useNavigate();
  const [items, setItems] = useState<Act[]>([]);
  const [person, setPerson] = useState('all');

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

  const people = useMemo(
    () => Array.from(new Set(items.map(i => i.actor).filter(Boolean))).sort() as string[],
    [items],
  );
  const filtered = person === 'all' ? items : items.filter(i => i.actor === person);
  const mName = (id: string) => mountains.find(m => m.id === id)?.name;

  return (
    <div className="space-y-2">
      <select
        value={person}
        onChange={e => setPerson(e.target.value)}
        className="bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] text-[#0a0a0a] outline-none"
      >
        <option value="all">Everyone</option>
        {people.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-6 text-center text-[13px] text-[#6a7282]">No activity yet.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <button key={a.id} onClick={() => navigate(`/mountains/${a.mountainId}`)}
              className="w-full text-left bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3 active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)]">
              <div className="text-[13px] text-[#0a0a0a]">{a.summary}</div>
              <div className="text-[11px] text-[#8992a0] mt-0.5">
                {a.actor}{mName(a.mountainId) ? ` · ${mName(a.mountainId)}` : ''} · {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
