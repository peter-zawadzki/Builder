import { Link, useNavigate } from "react-router";
import { UserButton } from "@clerk/clerk-react";
import { Mountain, Users, Boxes, UserPlus, Wrench, Database, TrendingUp, Activity as ActivityIcon, Bell, FolderKanban } from "lucide-react";
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";
import { useIsSuperAdmin } from "../hooks/useRole";
import { Pipeline, ActivityFeed, FollowUps } from "./crm/CRM";

// The landing page after login: pipeline, recent activity, and follow-ups at a
// glance, with the top-right icons to jump into each section.
export function HomeDashboard() {
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4">
        <div className="flex flex-col items-center justify-center relative">
          <Link to="/"><img src={imgImageYullrLogo} alt="Yullr" className="h-16 mb-3" /></Link>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[24px]">Mountain Builder</h1>
          <div className="absolute left-0 top-0 flex items-center h-9">
            <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }}>
              {isSuperAdmin && (
                <UserButton.MenuItems>
                  <UserButton.Action label="Team &amp; invites" labelIcon={<UserPlus size={16} />} onClick={() => navigate('/team')} />
                  <UserButton.Action label="Inspection items" labelIcon={<Wrench size={16} />} onClick={() => navigate('/inspection-items')} />
                  <UserButton.Action label="Local DB check" labelIcon={<Database size={16} />} onClick={() => navigate('/system-check')} />
                </UserButton.MenuItems>
              )}
            </UserButton>
          </div>
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <Link to="/projects">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Projects"><FolderKanban size={20} className="text-[#6a7282]" /></button>
            </Link>
            <Link to="/mountains">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Mountains"><Mountain size={20} className="text-[#6a7282]" /></button>
            </Link>
            <Link to="/crm">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="People &amp; contacts"><Users size={20} className="text-[#6a7282]" /></button>
            </Link>
            <Link to="/inventory">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Inventory"><Boxes size={20} className="text-[#6a7282]" /></button>
            </Link>
          </div>
        </div>
      </div>

      {/* Dashboard */}
      <div className="max-w-5xl mx-auto p-4 flex flex-col gap-6">
        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <TrendingUp size={16} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">Pipeline</h2>
          </div>
          <Pipeline />
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
          <ActivityFeed />
        </section>
      </div>
    </div>
  );
}
