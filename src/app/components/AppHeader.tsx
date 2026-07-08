import { Link, useNavigate, useLocation } from 'react-router';
import { UserButton } from '@clerk/clerk-react';
import { Mountain, Users, Boxes, FolderKanban, UserPlus, Wrench, Database } from 'lucide-react';
import imgImageYullrLogo from 'figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png';
import { useIsSuperAdmin } from '../hooks/useRole';

// The one nav header shared across every section. The icon for the section
// you're on is highlighted orange.
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
    <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4">
      <div className="flex flex-col items-center justify-center relative">
        <Link to="/"><img src={imgImageYullrLogo} alt="Yullr" className="h-16 mb-3" /></Link>
        <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[24px]">Mountain Builder</h1>

        {/* Left: signed-in user (super-admin gets admin actions) */}
        <div className="absolute left-0 top-0 flex items-center h-9">
          <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }}>
            {isSuperAdmin && (
              <UserButton.MenuItems>
                <UserButton.Action label="Team & invites" labelIcon={<UserPlus size={16} />} onClick={() => navigate('/team')} />
                <UserButton.Action label="Inspection items" labelIcon={<Wrench size={16} />} onClick={() => navigate('/inspection-items')} />
                <UserButton.Action label="Local DB check" labelIcon={<Database size={16} />} onClick={() => navigate('/system-check')} />
              </UserButton.MenuItems>
            )}
          </UserButton>
        </div>

        {/* Right: primary section navigation — active icon highlighted orange */}
        <div className="absolute right-0 top-0 flex items-center gap-2">
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
        </div>
      </div>
    </div>
  );
}
