import { Link, useNavigate, useLocation } from 'react-router';
import { UserButton } from '@clerk/clerk-react';
import { Mountain, Users, Boxes, FolderKanban, UserPlus, Wrench, Database } from 'lucide-react';
import imgImageYullrLogo from 'figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png';
import { useIsSuperAdmin } from '../hooks/useRole';

// The one nav header shared across every page and sub-page. The icon for the
// section you're on is highlighted orange.
const NAV = [
  { to: '/projects', Icon: FolderKanban, label: 'Projects', match: (p: string) => p === '/projects' || p.startsWith('/projects/') },
  { to: '/mountains', Icon: Mountain, label: 'Mountains', match: (p: string) => p === '/mountains' || p.startsWith('/mountains/') },
  { to: '/crm', Icon: Users, label: 'People & contacts', match: (p: string) => p.startsWith('/crm') },
  { to: '/inventory', Icon: Boxes, label: 'Inventory', match: (p: string) => p.startsWith('/inventory') },
];

export function AppHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isSuperAdmin = useIsSuperAdmin();

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
          <div className="flex items-center h-9 pl-1">
            <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }}>
              {isSuperAdmin && (
                <UserButton.MenuItems>
                  <UserButton.Action label="Team & invites" labelIcon={<UserPlus size={16} />} onClick={() => navigate('/team')} />
                  <UserButton.Action label="Inspection items" labelIcon={<Wrench size={16} />} onClick={() => navigate('/inspection-items')} />
                  <UserButton.Action label="Local DB check" labelIcon={<Database size={16} />} onClick={() => navigate('/system-check')} />
                </UserButton.MenuItems>
              )}
            </UserButton>
          </div>
        </div>
      </div>
    </div>
  );
}
