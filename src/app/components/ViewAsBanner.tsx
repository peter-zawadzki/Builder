import { Eye } from 'lucide-react';
import { useRealUserRole } from '../hooks/useRole';
import { useRoleOverride } from '../context/RoleOverrideContext';

const ROLE_LABEL: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', user: 'User' };

// Impossible-to-miss reminder that you're seeing the app as a lower role than
// your real one — without this, a super admin previewing as "User" could
// easily forget why some buttons vanished and think something broke.
export function ViewAsBanner() {
  const real = useRealUserRole();
  const { override, setOverride } = useRoleOverride();

  if (real !== 'super_admin' || !override || override === 'super_admin') return null;

  return (
    <div className="bg-[#1D2930] text-white px-4 py-2 flex items-center justify-center gap-2 text-[12px] font-['Inter:Medium',sans-serif]">
      <Eye size={14} className="text-[#ff5c39]" />
      <span>Previewing as {ROLE_LABEL[override]} — some admin features are hidden</span>
      <button type="button" onClick={() => setOverride(null)} className="underline active:opacity-70">
        Exit preview
      </button>
    </div>
  );
}
