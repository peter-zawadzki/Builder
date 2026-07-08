import { useState } from "react";
import { TrendingUp, Activity as ActivityIcon, Bell } from "lucide-react";
import { FollowUps } from "./crm/CRM";
import { ActiveProjects } from "./projects/ActiveProjects";
import { RecentActivity } from "./RecentActivity";
import { useMyContact, useCanSeeAll } from "../hooks/useMyContact";

// The landing page after login: one master My/All toggle scopes every section
// (active projects, follow-ups, recent activity).
export function HomeDashboard() {
  const me = useMyContact();
  const canSeeAll = useCanSeeAll(); // false for Ambassadors
  const [scope, setScope] = useState<'mine' | 'all'>(me ? 'mine' : 'all');
  const effective: 'mine' | 'all' = !me ? 'all' : canSeeAll ? scope : 'mine';

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="max-w-5xl mx-auto p-4 flex flex-col gap-6">
        {/* Master scope toggle */}
        {me && canSeeAll ? (
          <div className="flex items-center justify-center">
            <div className="inline-flex bg-white border border-[rgba(0,0,0,0.1)] rounded-full p-1">
              {(['mine', 'all'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-['Inter:Medium',sans-serif] transition-colors ${scope === s ? 'bg-[#1D2930] text-white' : 'text-[#6a7282]'}`}
                >
                  {s === 'mine' ? 'My Projects' : 'All Projects'}
                </button>
              ))}
            </div>
          </div>
        ) : !me ? (
          <p className="text-center text-[12px] text-[#8992a0]">Showing everything — link your login to a YULLR contact (matching your email) to see just your stuff.</p>
        ) : (
          <p className="text-center text-[12px] text-[#8992a0]">Showing your projects.</p>
        )}

        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <TrendingUp size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Active projects</h2>
          </div>
          <ActiveProjects scope={effective} />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Bell size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Needs follow-up</h2>
          </div>
          <FollowUps scope={effective} />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <ActivityIcon size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Recent activity</h2>
          </div>
          <RecentActivity scope={effective} />
        </section>
      </div>
    </div>
  );
}
