import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Database, Plus } from "lucide-react";
import { useApi } from "../api/client";
import { useIsSuperAdmin } from "../hooks/useRole";

// Diagnostic screen: exercises the local full-stack end to end — the browser's
// Clerk token → the Hono API → local Postgres — and shows the results. Also the
// first real screen running on the new backend rather than the Supabase KV store.
export function SystemCheck() {
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();
  const api = useApi();

  const [me, setMe] = useState<any>(null);
  const [mountains, setMountains] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const meRes = await api.me();
      setMe(meRes.user);
      const list = await api.listMountains();
      setMountains(list.mountains);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addTestMountain(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createMountain({ name: name.trim() });
      setName("");
      const list = await api.listMountains();
      setMountains(list.mountains);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center text-[#6a7282]">
        Not available.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]">
          <ArrowLeft size={20} className="text-[#6a7282]" />
        </button>
        <div className="flex items-center gap-2">
          <Database size={18} className="text-[#1D2930]" />
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">Local DB check</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        {/* Data source toggle — flips the whole app between Supabase (live) and the local DB */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4 flex items-center justify-between">
          <div>
            <div className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Data source</div>
            <div className="text-[13px] text-[#6a7282]">
              {localStorage.getItem("yullr_use_local") === "1" ? "Local database (preview)" : "Supabase (live)"}
            </div>
          </div>
          <button
            onClick={() => {
              const now = localStorage.getItem("yullr_use_local") === "1";
              if (now) localStorage.removeItem("yullr_use_local");
              else localStorage.setItem("yullr_use_local", "1");
              window.location.href = "/";
            }}
            className="bg-[#1D2930] text-white rounded-[8px] px-4 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px]"
          >
            {localStorage.getItem("yullr_use_local") === "1" ? "Switch to Supabase" : "Switch to Local DB"}
          </button>
        </div>

        <button
          onClick={refresh}
          disabled={busy}
          className="self-start bg-[#1D2930] text-white rounded-[8px] px-4 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px] disabled:opacity-50 flex items-center gap-2"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Run check
        </button>

        {error && (
          <div className="bg-[#fbeceb] text-[#b23b3b] rounded-[10px] p-3 text-[14px] flex items-center gap-2">
            <XCircle size={16} /> {error}
          </div>
        )}

        {me && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
            <div className="flex items-center gap-2 text-[#3f7a5c] text-[13px] font-medium mb-2">
              <CheckCircle2 size={15} /> Authenticated &amp; synced to the users table
            </div>
            <pre className="text-[12px] text-[#0a0a0a] overflow-x-auto">{JSON.stringify(me, null, 2)}</pre>
          </div>
        )}

        {mountains && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
            <div className="flex items-center gap-2 text-[#3f7a5c] text-[13px] font-medium mb-3">
              <CheckCircle2 size={15} /> Mountains from local Postgres ({mountains.length})
            </div>
            <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.06)]">
              {mountains.map((m) => (
                <div key={m.id} className="py-2 text-[14px] text-[#0a0a0a]">
                  {m.name} <span className="text-[#6a7282] text-[12px]">· {m.status}</span>
                </div>
              ))}
              {mountains.length === 0 && (
                <div className="py-2 text-[13px] text-[#6a7282]">No rows yet — add one below.</div>
              )}
            </div>

            <form onSubmit={addTestMountain} className="flex gap-2 mt-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New mountain name"
                className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[14px] outline-none border-2 border-transparent focus:border-[#1D2930]"
              />
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="bg-[#ff5c39] text-white rounded-[8px] px-4 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px] disabled:opacity-50 flex items-center gap-1.5"
              >
                <Plus size={15} /> Add
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
