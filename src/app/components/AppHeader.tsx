import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { UserButton } from '@clerk/clerk-react';
import { Mountain, Users, Boxes, UserPlus, Wrench, Bell, X, ListTodo, MessageSquare, ChevronRight, FileText, Tag, BookOpen, Sparkles, MessageSquareWarning, BrainCircuit, ClipboardList, Mail, MailX, Activity, Eye, Check } from 'lucide-react';
import imgImageYullrLogo from 'figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png';
import { useIsAdminOrAbove, useRealUserRole } from '../hooks/useRole';
import { useRoleOverride } from '../context/RoleOverrideContext';
import { useData, getMyNotifications } from '../context/DataContext';
import type { MyNotificationEntry } from '../context/DataContext';
import { useMyContact } from '../hooks/useMyContact';
import { useOdinVideoNotifications } from '../hooks/useOdinVideoNotifications';
import { useFeedbackNotifications } from '../hooks/useFeedbackNotifications';
import { useNoteNotifications } from '../hooks/useNoteNotifications';
import { useApi } from '../api/client';
import { HelpModal } from './HelpModal';

// Clerk's <UserButton.MenuItems> only accepts literal <UserButton.Action>/
// <UserButton.Link> children — wrapping one in another component gets
// silently ignored (logs a Clerk warning, renders nothing). So this state
// lives in AppHeader itself and the toggle is rendered inline as a real
// UserButton.Action, same as every other menu entry here.
function useDigestPreference() {
  const api = useApi();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.me().then(r => setEnabled(r.user.dailyDigestEnabled)).catch(() => {});
  }, [api]);

  function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    api.updateDigestPreference(next).catch(() => setEnabled(!next));
  }

  return { enabled, toggle };
}

// The one nav header shared across every page and sub-page. The icon for the
// section you're on is highlighted orange. Projects live inside each mountain,
// so there's no top-level projects section — Site Assessments follow the
// same pattern (mountain-scoped, reached from within a mountain's detail
// page, not its own top-level nav destination).
const NAV = [
  { to: '/mountains', Icon: Mountain, label: 'Mountains', match: (p: string) => p === '/mountains' || p.startsWith('/mountains/') },
  { to: '/crm', Icon: Users, label: 'People & contacts', match: (p: string) => p.startsWith('/crm') },
  { to: '/inventory', Icon: Boxes, label: 'Inventory', match: (p: string) => p.startsWith('/inventory') },
];

export function AppHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canManageTeam = useIsAdminOrAbove();
  const realRole = useRealUserRole();
  const { override, setOverride } = useRoleOverride();
  const digestPreference = useDigestPreference();
  const me = useMyContact();
  const { mountains, contacts, organizations, teams, projects, locations, inspections, notes } = useData();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const notifications = getMyNotifications(me?.id, { mountains, contacts, organizations, teams, projects, locations, inspections, notes });
  const { notifications: odinNotifications, markRead: markOdinNotificationRead } = useOdinVideoNotifications();
  const { notifications: feedbackNotifications, markRead: markFeedbackNotificationRead } = useFeedbackNotifications();
  const { notifications: noteNotifications, markRead: markNoteNotificationRead } = useNoteNotifications();

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
            {(notifications.length + odinNotifications.length + feedbackNotifications.length + noteNotifications.length) > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#ff5c39] text-white text-[10px] font-['Inter:Medium',sans-serif] font-medium flex items-center justify-center">
                {(notifications.length + odinNotifications.length + feedbackNotifications.length + noteNotifications.length) > 9 ? '9+' : notifications.length + odinNotifications.length + feedbackNotifications.length + noteNotifications.length}
              </span>
            )}
          </button>
          <button onClick={() => setShowHelp(true)} className="p-2 rounded-[8px] bg-[#f3f3f5] active:bg-[#e8e8ea]" title="Ask ODIN">
            <Sparkles size={20} className="text-[#307fe2]" />
          </button>
          <div className="flex items-center h-9 pl-1">
            <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }}>
              <UserButton.MenuItems>
                <UserButton.Action label="Resource Center" labelIcon={<BookOpen size={16} />} onClick={() => navigate('/resources')} />
                <UserButton.Action label="YULLR Monitor" labelIcon={<Activity size={16} />} onClick={() => window.open('https://portal.yullr.com/monitor/', '_blank', 'noopener,noreferrer')} />
                {canManageTeam && <UserButton.Action label="Team & invites" labelIcon={<UserPlus size={16} />} onClick={() => navigate('/team')} />}
                {canManageTeam && <UserButton.Action label="Inspection items" labelIcon={<Wrench size={16} />} onClick={() => navigate('/inspection-items')} />}
                {canManageTeam && <UserButton.Action label="Order Terms" labelIcon={<FileText size={16} />} onClick={() => navigate('/proposal-terms')} />}
                {canManageTeam && <UserButton.Action label="Order Template" labelIcon={<FileText size={16} />} onClick={() => navigate('/proposal-template')} />}
                {canManageTeam && <UserButton.Action label="Agreement template" labelIcon={<FileText size={16} />} onClick={() => navigate('/agreement-template')} />}
                {canManageTeam && <UserButton.Action label="Contact tags" labelIcon={<Tag size={16} />} onClick={() => navigate('/contact-tags')} />}
                {canManageTeam && <UserButton.Action label="Knowledge base" labelIcon={<BrainCircuit size={16} />} onClick={() => navigate('/admin/knowledge-base')} />}
                {canManageTeam && <UserButton.Action label="Feedback requests" labelIcon={<ClipboardList size={16} />} onClick={() => navigate('/admin/feedback')} />}
                {digestPreference.enabled !== null && (
                  <UserButton.Action
                    label={digestPreference.enabled ? 'Daily digest: On' : 'Daily digest: Off'}
                    labelIcon={digestPreference.enabled ? <Mail size={16} /> : <MailX size={16} />}
                    onClick={digestPreference.toggle}
                  />
                )}
                {/* "View as" — lets a real super admin preview the app as a lower
                    role without a second account. Checked against the REAL role
                    (not the overridden one), so this stays visible and usable
                    even while previewing as User — otherwise switching down
                    would hide the only way to switch back. Clerk's
                    UserButton.MenuItems only accepts literal UserButton.Action
                    children (see comment atop this file) — a .map()/Fragment
                    here gets silently dropped, so these are written out flat. */}
                {realRole === 'super_admin' && (
                  <UserButton.Action
                    label="View as: Super Admin"
                    labelIcon={!override ? <Check size={16} className="text-[#ff5c39]" /> : <Eye size={16} />}
                    onClick={() => setOverride(null)}
                  />
                )}
                {realRole === 'super_admin' && (
                  <UserButton.Action
                    label="View as: Admin"
                    labelIcon={override === 'admin' ? <Check size={16} className="text-[#ff5c39]" /> : <Eye size={16} />}
                    onClick={() => setOverride('admin')}
                  />
                )}
                {realRole === 'super_admin' && (
                  <UserButton.Action
                    label="View as: User"
                    labelIcon={override === 'user' ? <Check size={16} className="text-[#ff5c39]" /> : <Eye size={16} />}
                    onClick={() => setOverride('user')}
                  />
                )}
              </UserButton.MenuItems>
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
              {notifications.length === 0 && odinNotifications.length === 0 && feedbackNotifications.length === 0 && noteNotifications.length === 0 ? (
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
              {odinNotifications.length > 0 && (
                <>
                  <div className="text-[11px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282] pt-2 px-1">Videos</div>
                  {odinNotifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setShowNotifications(false);
                        markOdinNotificationRead(n.id);
                        navigate(`/odin-videos/${n.videoId}`);
                      }}
                      className="w-full text-left bg-[#f9fafb] rounded-[10px] border border-[rgba(0,0,0,0.06)] p-3 active:bg-[#f3f3f5]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#f3f3f5] text-[#307fe2] flex items-center gap-1">
                          <Sparkles size={10} /> {n.kind === 'video_ready' ? 'Ready' : 'Failed'}
                        </span>
                        <ChevronRight size={14} className="text-[#c0c4cc] shrink-0" />
                      </div>
                      <p className="text-[13px] text-[#0a0a0a] mt-1">{n.text}</p>
                    </button>
                  ))}
                </>
              )}
              {feedbackNotifications.length > 0 && (
                <>
                  <div className="text-[11px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282] pt-2 px-1">Feedback</div>
                  {feedbackNotifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setShowNotifications(false);
                        markFeedbackNotificationRead(n.id);
                        navigate(`/feedback/${n.submissionId}`);
                      }}
                      className="w-full text-left bg-[#f9fafb] rounded-[10px] border border-[rgba(0,0,0,0.06)] p-3 active:bg-[#f3f3f5]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#f3f3f5] text-[#307fe2] flex items-center gap-1">
                          <MessageSquareWarning size={10} /> {n.kind === 'review_requested' ? 'Review requested' : 'Revised'}
                        </span>
                        <ChevronRight size={14} className="text-[#c0c4cc] shrink-0" />
                      </div>
                      <p className="text-[13px] text-[#0a0a0a] mt-1">{n.text}</p>
                    </button>
                  ))}
                </>
              )}
              {noteNotifications.length > 0 && (
                <>
                  <div className="text-[11px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282] pt-2 px-1">Replies</div>
                  {noteNotifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setShowNotifications(false);
                        markNoteNotificationRead(n.id);
                        if (!n.mountainId) return;
                        const param = n.originCollection === 'projects' ? `openProject=${n.originId}` : `highlightNote=${n.noteId}`;
                        navigate(`/mountains/${n.mountainId}?${param}`);
                      }}
                      className="w-full text-left bg-[#f9fafb] rounded-[10px] border border-[rgba(0,0,0,0.06)] p-3 active:bg-[#f3f3f5]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#eef3fb] text-[#307fe2] flex items-center gap-1">
                          <MessageSquare size={10} /> Reply
                        </span>
                        <ChevronRight size={14} className="text-[#c0c4cc] shrink-0" />
                      </div>
                      <p className="text-[13px] text-[#0a0a0a] mt-1">{n.text}</p>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
