import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { UserButton } from '@clerk/clerk-react';
import { Mountain, Users, Boxes, UserPlus, Wrench, Bell, X, ListTodo, MessageSquare, ChevronRight, FileText } from 'lucide-react';
import imgImageYullrLogo from 'figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png';
import { useIsSuperAdmin } from '../hooks/useRole';
import { useData, getMyNotifications } from '../context/DataContext';
import type { MyNotificationEntry } from '../context/DataContext';
import { useMyContact } from '../hooks/useMyContact';

// The one nav header shared across every page and sub-page. The icon for the
// section you're on is highlighted orange. Projects live inside each mountain,
// so there's no top-level projects section.
const NAV = [
  { to: '/mountains', Icon: Mountain, label: 'Mountains', match: (p: string) => p === '/mountains' || p.startsWith('/mountains/') },
  { to: '/crm', Icon: Users, label: 'People & contacts', match: (p: string) => p.startsWith('/crm') },
  { to: '/inventory', Icon: Boxes, label: 'Inventory', match: (p: string) => p.startsWith('/inventory') },
];

export function AppHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isSuperAdmin = useIsSuperAdmin();
  const me = useMyContact();
  const { mountains, contacts, organizations, teams, projects, locations, inspections, notes } = useData();
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = getMyNotifications(me?.id, { mountains, contacts, organizations, teams, projects, locations, inspections, notes });

  const goToNotification = (n: MyNotificationEntry) => {
    setShowNotifications(false);
    if (n.origin === 'organization' && n.organizationId) navigate(`/crm?tab=organizations&open=${n.organizationId}`);
    else if (n.origin === 'team' && n.teamId) navigate(`/crm?tab=teams&open=${n.teamId}`);
    else if (n.origin === 'inspection' && n.mountainId && n.locationId) navigate(`/mountains/${n.mountainId}/locations/${n.locationId}`);
    else if (n.mountainId) navigate(`/mountains/${n.mountainId}`);
    else if (n.origin === 'contact') navigate('/crm?tab=contacts');
  };

  return (
    <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* Left: brand */}
        <Link to="/" className="flex items-center gap-2 active:opacity-70 shrink-0">
          <img src={imgImageYullrLogo} alt="Yullr" className="h-7" />
          <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] tracking-[0.06em]">BUILDER</span>
        </Link>

        {/* Right: section navigation (active icon orange), then the signed-in user */}
        <div className="flex items-center gap-2">
          {NAV.map(({ to, Icon, label, match }) => {
            const active = match(pathname);
            return (
              <Link to={to} key={to}>
                <button
                  title={label}
                  aria-current={active ? 'page' : undefined}
                  className={`p-2 rounded-[8px] ${active ? 'bg-[#fff0ec]' : 'bg-[#f3f3f5] active:bg-[#e8e8ea]'}`}
                >
                  <Icon size={20} className={active ? 'text-[#ff5c39]' : 'text-[#6a7282]'} />
                </button>
              </Link>
            );
          })}
          <button onClick={() => setShowNotifications(true)} className="relative p-2 rounded-[8px] bg-[#f3f3f5] active:bg-[#e8e8ea]" title="Notifications">
            <Bell size={20} className="text-[#6a7282]" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#ff5c39] text-white text-[10px] font-['Inter:Medium',sans-serif] font-medium flex items-center justify-center">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
          <div className="flex items-center h-9 pl-1">
            <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }}>
              {isSuperAdmin && (
                <UserButton.MenuItems>
                  <UserButton.Action label="Team & invites" labelIcon={<UserPlus size={16} />} onClick={() => navigate('/team')} />
                  <UserButton.Action label="Inspection items" labelIcon={<Wrench size={16} />} onClick={() => navigate('/inspection-items')} />
                  <UserButton.Action label="Proposal terms" labelIcon={<FileText size={16} />} onClick={() => navigate('/proposal-terms')} />
                </UserButton.MenuItems>
              )}
            </UserButton>
          </div>
        </div>
      </div>

      {showNotifications && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { if (e.target === e.currentTarget) setShowNotifications(false); }}>
          <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Notifications</h2>
              <button onClick={() => setShowNotifications(false)} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-[13px] text-[#6a7282]">Nothing assigned to you right now.</div>
              ) : (
                notifications.map(n => (
                  <button key={n.id} onClick={() => goToNotification(n)} className="w-full text-left bg-[#f9fafb] rounded-[10px] border border-[rgba(0,0,0,0.06)] p-3 active:bg-[#f3f3f5]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#f3f3f5] text-[#6a7282] flex items-center gap-1">
                        {n.type === 'action' ? <ListTodo size={10} /> : <MessageSquare size={10} />}
                        {n.originLabel || n.origin}
                      </span>
                      <ChevronRight size={14} className="text-[#c0c4cc] shrink-0" />
                    </div>
                    <p className="text-[13px] text-[#0a0a0a] mt-1">{n.text}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
