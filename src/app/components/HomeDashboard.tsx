import { TrendingUp, Activity as ActivityIcon, Bell } from "lucide-react";
import { FollowUps } from "./crm/CRM";
import { ActiveProjects } from "./projects/ActiveProjects";
import { RecentActivity } from "./RecentActivity";

// The landing page after login: pipeline, recent activity, and follow-ups at a
// glance, with the shared header to jump into each section.
export function HomeDashboard() {
  return (
    <div className="min-h-screen bg-[#f9fafb]">

      {/* Dashboard */}
      <div className="max-w-5xl mx-auto p-4 flex flex-col gap-6">
        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <TrendingUp size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Active projects</h2>
          </div>
          <ActiveProjects />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Bell size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Needs follow-up</h2>
          </div>
          <FollowUps />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <ActivityIcon size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Recent activity</h2>
          </div>
          <RecentActivity />
        </section>
      </div>
    </div>
  );
}
