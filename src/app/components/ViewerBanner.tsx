import { Eye } from 'lucide-react';
import { useIsViewer } from '../hooks/useRole';

// Shown for real viewer accounts (investor/observer read-only access) — not
// to be confused with ViewAsBanner, which is a super admin's own temporary
// preview toggle. This one is just an honest, permanent label: nothing here
// can be dismissed, because the account genuinely can't make changes.
export function ViewerBanner() {
  if (!useIsViewer()) return null;

  return (
    <div className="bg-[#eef3fb] text-[#307fe2] px-4 py-2 flex items-center justify-center gap-2 text-[12px] font-['Inter:Medium',sans-serif]">
      <Eye size={14} />
      <span>View-only access — you can browse everything here, but changes aren't saved.</span>
    </div>
  );
}
