import { Outlet, useNavigate } from 'react-router';
import { Lock } from 'lucide-react';
import { useIsAdminOrAbove } from '../hooks/useRole';

// Financial Planning is folded in from a standalone app (see
// src/app/financial-planning/) and is restricted to Admins and Super Admins.
// The API is already gated server-side (requireAdmin in
// server/routes/financialScenarios.ts); this blocks the client route too, so
// a non-admin who navigates here directly sees a message instead of a
// broken/empty shell.
export function FinancialPlanningGate() {
  const navigate = useNavigate();
  const canView = useIsAdminOrAbove();

  if (!canView) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#f3f3f5] flex items-center justify-center">
          <Lock size={24} className="text-[#6a7282]" />
        </div>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Not available</h1>
          <p className="text-[#6a7282] text-[14px] mt-1">Financial Planning is restricted to admins and super admins.</p>
        </div>
        <button onClick={() => navigate('/')} className="bg-[#1D2930] text-white rounded-[8px] px-5 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px]">Back to app</button>
      </div>
    );
  }

  return <Outlet />;
}
