import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { TrendingUp, Activity as ActivityIcon, ListTodo, MessageSquare, ChevronRight } from "lucide-react";
import { ActiveProjects } from "./projects/ActiveProjects";
import { RecentActivity } from "./RecentActivity";
import { useMyContact, useCanSeeAll } from "../hooks/useMyContact";
import { useData, getMyNotifications, getAllOpenActivities } from "../context/DataContext";
import type { MyNotificationEntry } from "../context/DataContext";

// The landing page after login: one master My/All toggle scopes every section
// (active projects, follow-ups, recent activity).
export function HomeDashboard() {
  const me = useMyContact();
  const navigate = useNavigate();
  const canSeeAll = useCanSeeAll(); // false for Ambassadors
  const [scope, setScope] = useState<'mine' | 'all'>(me ? 'mine' : 'all');
  const effective: 'mine' | 'all' = !me ? 'all' : canSeeAll ? scope : 'mine';

  const { mountains, contacts, organizations, teams, projects, locations, notes } = useData();
  const activityData = { mountains, contacts, organizations, teams, projects, locations, notes };
  const activityItems = useMemo(
    () => effective === 'mine' ? getMyNotifications(me?.id, activityData) : getAllOpenActivities(activityData),
    [effective, me?.id, mountains, contacts, organizations, teams, projects, locations, notes],
  );
  const notesItems = useMemo(() => activityItems.filter(n => n.type === 'note'), [activityItems]);
  const actionItems = useMemo(() => activityItems.filter(n => n.type === 'action'), [activityItems]);

  const goToActivity = (n: MyNotificationEntry) => {
    if (n.origin === 'organization' && n.organizationId) navigate(`/crm?tab=organizations&open=${n.organizationId}`);
    else if (n.origin === 'team' && n.teamId) navigate(`/crm?tab=teams&open=${n.teamId}`);
    else if (n.origin === 'inspection' && n.mountainId && n.locationId) navigate(`/mountains/${n.mountainId}/locations/${n.locationId}`);
    else if (n.mountainId) navigate(`/mountains/${n.mountainId}`);
    else if (n.origin === 'contact') navigate('/crm?tab=contacts');
  };

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
            <ListTodo size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Action items</h2>
          </div>
          <ActivityList items={actionItems} emptyLabel={effective === 'mine' ? 'No action items assigned to you right now.' : 'No open action items.'} onOpen={goToActivity} />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <MessageSquare size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Notes</h2>
          </div>
          <ActivityList items={notesItems} emptyLabel={effective === 'mine' ? 'No notes assigned to you right now.' : 'No open notes.'} onOpen={goToActivity} />
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

function ActivityList({ items, emptyLabel, onOpen }: { items: MyNotificationEntry[]; emptyLabel: string; onOpen: (n: MyNotificationEntry) => void }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-6 text-center text-[13px] text-[#6a7282]">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map(n => (
        <button key={`${n.origin}:${n.id}`} onClick={() => onOpen(n)} className="w-full text-left bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3 active:bg-[#f9fafb]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#f3f3f5] text-[#6a7282] flex items-center gap-1">
              {n.type === 'action' ? <ListTodo size={10} /> : <MessageSquare size={10} />}
              {n.originLabel || n.origin}
            </span>
            <ChevronRight size={14} className="text-[#c0c4cc] shrink-0" />
          </div>
          <p className="text-[13px] text-[#0a0a0a] mt-1">{n.text}</p>
        </button>
      ))}
    </div>
  );
}
