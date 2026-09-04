import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { ArrowLeft, Shield, User, Trash2, X, Loader2, Send, Lock } from "lucide-react";
import { toast } from "sonner";
import { useIsAdminOrAbove, useIsSuperAdmin, useRealUserRole } from "../hooks/useRole";
import { useApi, type TeamMemberRole } from "../api/client";

// Custom team management: invite teammates and manage members, scoped to the
// single YULLR organization. Intentionally renders NO organization edit / delete
// / leave controls — org management is not exposed anywhere in the app. Only
// admins see the invite form and the remove/revoke actions.
//
// The role this page manages is Builder's own app role (user / admin /
// super_admin / viewer, server/auth.ts) — the thing that actually gates
// every feature in the app, including read-only Viewer access. Clerk's own
// organization role (org:member / org:admin) only exists in the background
// because Clerk's invite/membership APIs require one; server/routes/team.ts
// keeps it in sync automatically (Admin/Super Admin -> org:admin, everyone
// else -> org:member) so it's never edited here directly.

const APP_ROLE_LABEL: Record<TeamMemberRole["role"], string> = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
  viewer: "Viewer",
};

function AppRoleBadge({ role }: { role: TeamMemberRole["role"] }) {
  const elevated = role === "admin" || role === "super_admin";
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif]"
      style={{
        backgroundColor: elevated ? "#fdece7" : "#f3f3f5",
        color: elevated ? "#c2410c" : "#6a7282",
      }}
    >
      {elevated ? <Shield size={11} /> : <User size={11} />}
      {APP_ROLE_LABEL[role]}
    </span>
  );
}

export function TeamPage() {
  const navigate = useNavigate();
  const canManageTeam = useIsAdminOrAbove();
  const isSuperAdmin = useIsSuperAdmin();
  const realRole = useRealUserRole();
  const api = useApi();
  const { user } = useUser();
  const { organization, membership, memberships, invitations, isLoaded } =
    useOrganization({ memberships: true, invitations: true });

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMemberRole["role"]>("user");
  const [inviting, setInviting] = useState(false);
  const [appRoles, setAppRoles] = useState<Record<string, TeamMemberRole["role"]>>({});
  const [pendingRoles, setPendingRoles] = useState<Record<string, TeamMemberRole["role"]>>({});
  const [updatingAppRole, setUpdatingAppRole] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageTeam || !organization?.id) return;
    api
      .listTeamRoles(organization.id)
      .then((r) => {
        setAppRoles(Object.fromEntries(r.members.map((m) => [m.clerkUserId, m.role])));
        setPendingRoles(r.pending ?? {});
      })
      .catch(() => {});
  }, [canManageTeam, organization?.id, api]);

  const handleAppRoleChange = async (clerkUserId: string, newRole: TeamMemberRole["role"]) => {
    if (!organization?.id) return;
    const previous = appRoles[clerkUserId];
    setAppRoles((prev) => ({ ...prev, [clerkUserId]: newRole }));
    setUpdatingAppRole(clerkUserId);
    try {
      await api.updateTeamRole(clerkUserId, newRole, organization.id);
      toast.success("Builder role updated");
    } catch (err: any) {
      setAppRoles((prev) => ({ ...prev, [clerkUserId]: previous }));
      toast.error(err?.message || "Could not update role");
    } finally {
      setUpdatingAppRole(null);
    }
  };

  // Team management is Admin/Super Admin only (Dev Story 10.1). Plain
  // Users cannot see or manage the team — the button is hidden for them and
  // a direct URL is blocked.
  if (!canManageTeam) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#f3f3f5] flex items-center justify-center">
          <Lock size={24} className="text-[#6a7282]" />
        </div>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
            Not available
          </h1>
          <p className="text-[#6a7282] text-[14px] mt-1 max-w-xs">
            Team management is restricted to admins.
          </p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="bg-[#1D2930] text-white rounded-[8px] px-5 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px]"
        >
          Back to app
        </button>
      </div>
    );
  }

  const isAdmin = membership?.role === "org:admin";
  // membership?.publicUserData?.userId was silently always undefined here
  // (never matched any row's u.userId), so "remove"/"edit role" controls
  // were never actually hidden for your own row — useUser()'s id is the
  // reliable source for "am I looking at myself."
  const selfUserId = user?.id;

  if (!isLoaded || !organization) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#6a7282]" size={28} />
      </div>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setInviting(true);
    try {
      await api.inviteTeamMember(addr, inviteRole, organization.id);
      toast.success(`Invitation sent to ${addr}`);
      setEmail("");
      setInviteRole("user");
      await invitations?.revalidate?.();
    } catch (err: any) {
      toast.error(err?.message || "Could not send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (inv: any) => {
    try {
      await inv.revoke();
      toast.success("Invitation revoked");
      await invitations?.revalidate?.();
    } catch {
      toast.error("Could not revoke invitation");
    }
  };

  const handleRemove = async (mem: any) => {
    try {
      await mem.destroy();
      toast.success("Member removed");
      await memberships?.revalidate?.();
    } catch {
      toast.error("Could not remove member");
    }
  };

  const pendingInvites = (invitations?.data ?? []).filter((i: any) => i.status === "pending");

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"
          title="Back"
        >
          <ArrowLeft size={20} className="text-[#6a7282]" />
        </button>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] leading-tight">
            Team
          </h1>
          <p className="text-[#6a7282] text-[13px]">{organization.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        {/* Invite (admins only) */}
        {isAdmin && (
          <form
            onSubmit={handleInvite}
            className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.08)] p-5"
          >
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-3">
              Invite a teammate
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@yullr.com"
                className="flex-1 bg-[#f3f3f5] rounded-[8px] px-4 py-3 text-[#0a0a0a] text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamMemberRole["role"])}
                title="Builder role — what this person will be able to do in the app"
                className="bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={inviting || !email.trim()}
                className="flex items-center justify-center gap-2 bg-[#ff5c39] text-white rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] disabled:opacity-50 active:opacity-80"
              >
                {inviting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Invite
              </button>
            </div>
          </form>
        )}

        {/* Members */}
        <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.08)] p-5">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">
            Members
          </h2>
          <p className="text-[#6a7282] text-[12px] mb-3">
            The dropdown next to each teammate sets their Builder role (User / Admin / Super Admin / Viewer) — this is
            what controls what they can actually do in the app.
          </p>
          <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.06)]">
            {(memberships?.data ?? []).map((mem: any) => {
              const u = mem.publicUserData ?? {};
              const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.identifier;
              const isSelf = u.userId === selfUserId;
              return (
                <div key={mem.id} className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-full bg-[#1D2930] flex items-center justify-center text-white text-[13px] font-medium overflow-hidden">
                    {u.imageUrl ? (
                      <img src={u.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (name || "?").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#0a0a0a] text-[14px] font-['Inter:Medium',sans-serif] font-medium truncate">
                      {name} {isSelf && <span className="text-[#6a7282] font-normal">(you)</span>}
                    </p>
                    <p className="text-[#6a7282] text-[12px] truncate">{u.identifier}</p>
                  </div>
                  {isAdmin && !isSelf && u.userId ? (
                    <select
                      value={appRoles[u.userId] ?? "user"}
                      disabled={updatingAppRole === u.userId}
                      onChange={(e) => handleAppRoleChange(u.userId, e.target.value as TeamMemberRole["role"])}
                      title="Builder role — what this person can actually do in the app"
                      className="text-[12px] bg-[#f3f3f5] rounded-full px-2.5 py-1 outline-none font-['Inter:Medium',sans-serif] disabled:opacity-50"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      {(isSuperAdmin || appRoles[u.userId] === "super_admin") && (
                        <option value="super_admin">Super Admin</option>
                      )}
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <AppRoleBadge role={isSelf ? realRole : (appRoles[u.userId] ?? "user")} />
                  )}
                  {isAdmin && !isSelf && (
                    <button
                      onClick={() => handleRemove(mem)}
                      className="p-2 rounded-[8px] active:bg-[#f3f3f5]"
                      title="Remove member"
                    >
                      <Trash2 size={16} className="text-[#6a7282]" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending invitations */}
        {pendingInvites.length > 0 && (
          <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.08)] p-5">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-3">
              Pending invitations
            </h2>
            <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.06)]">
              {pendingInvites.map((inv: any) => (
                <div key={inv.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#0a0a0a] text-[14px] truncate">{inv.emailAddress}</p>
                    <p className="text-[#6a7282] text-[12px]">Invited · awaiting acceptance</p>
                  </div>
                  <AppRoleBadge role={pendingRoles[inv.emailAddress?.toLowerCase()] ?? "user"} />
                  {isAdmin && (
                    <button
                      onClick={() => handleRevoke(inv)}
                      className="p-2 rounded-[8px] active:bg-[#f3f3f5]"
                      title="Revoke invitation"
                    >
                      <X size={16} className="text-[#6a7282]" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
