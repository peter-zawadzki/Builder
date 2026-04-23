import { Link } from 'react-router';
import { useData } from '../context/DataContext';
import { Plus, ChevronRight, Settings } from 'lucide-react';
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";

export function MountainsList() {
  const { mountains } = useData();

  return (
    <div className="min-h-screen bg-[#F2F3F5] flex flex-col">

      {/* ── Branded header (YULLR dark navy) ─────────────────────────────── */}
      <div className="bg-[#1D2930] px-4 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img src={imgImageYullrLogo} alt="Yullr" className="h-10 w-10 object-contain" />
            <div>
              <p className="text-[#F95C39] text-[11px] font-medium tracking-widest uppercase leading-none mb-0.5">
                YULLR
              </p>
              <h1 className="text-white text-[22px] font-bold leading-tight">
                Mountain Builder
              </h1>
            </div>
          </div>
          {/* Admin / Catalog link */}
          <Link to="/admin">
            <button
              className="p-2.5 bg-white/10 rounded-[10px] active:bg-white/20 transition-colors mt-0.5"
              title="Catalog"
            >
              <Settings size={19} className="text-white/80" />
            </button>
          </Link>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-4 mt-5">
          <div className="flex-1 bg-white/8 rounded-[10px] px-3 py-2.5 border border-white/10">
            <p className="text-white/50 text-[11px] font-medium uppercase tracking-wide">Mountains</p>
            <p className="text-white text-[22px] font-bold leading-tight mt-0.5">{mountains.length}</p>
          </div>
          <div className="flex-1 bg-white/8 rounded-[10px] px-3 py-2.5 border border-white/10">
            <p className="text-white/50 text-[11px] font-medium uppercase tracking-wide">Status</p>
            <p className="text-[#F95C39] text-[13px] font-semibold leading-tight mt-0.5">
              {mountains.length === 0 ? 'No sites' : 'Active'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pt-5 pb-8">

        {/* Add New Mountain */}
        <Link to="/mountains/new">
          <button className="w-full bg-[#F95C39] text-white rounded-[12px] px-4 py-3.5 flex items-center justify-center gap-2 font-semibold text-[15px] mb-5 active:opacity-80 shadow-sm">
            <Plus size={20} strokeWidth={2.5} />
            Add New Mountain
          </button>
        </Link>

        {/* List */}
        {mountains.length === 0 ? (
          <div className="bg-white rounded-[14px] border border-[rgba(29,41,48,0.08)] p-10 text-center shadow-sm">
            <div className="w-16 h-16 bg-[#F2F3F5] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6D7B83" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
              </svg>
            </div>
            <p className="text-[#6D7B83] text-[15px] font-medium">No mountains yet</p>
            <p className="text-[#6D7B83] text-[13px] mt-1 opacity-70">
              Add your first mountain to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mountains.map((mountain) => (
              <Link key={mountain.id} to={`/mountains/${mountain.id}`}>
                <div className="bg-white rounded-[14px] border border-[rgba(29,41,48,0.08)] p-4 active:bg-[#F2F3F5] transition-colors shadow-sm flex items-center gap-3">
                  {/* Icon */}
                  <div className="w-11 h-11 bg-[#FFEDE9] rounded-[10px] flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F95C39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
                    </svg>
                  </div>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#1D2930] font-semibold text-[16px] leading-tight">
                      {mountain.name}
                    </h3>
                    {mountain.address && (
                      <p className="text-[#6D7B83] text-[13px] mt-0.5 truncate">
                        {mountain.address}
                      </p>
                    )}
                    {mountain.parentOrganization && (
                      <p className="text-[#6D7B83] text-[12px] opacity-75 truncate">
                        {mountain.parentOrganization}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-[#6D7B83] opacity-50 flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
