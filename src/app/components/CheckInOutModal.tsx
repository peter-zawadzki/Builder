import { useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { X, Search } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { Asset } from '../context/DataContext';

function assetName(a: Asset) {
  return [a.customManufacturer || a.manufacturer, a.customModel || a.model].filter(Boolean).join(' ')
    || a.inventorySubcategory || a.inventoryCategory || a.type;
}
function matches(a: Asset, q: string) {
  const s = q.toLowerCase();
  return assetName(a).toLowerCase().includes(s)
    || (a.serialNumber || '').toLowerCase().includes(s)
    || (a.yullrInventoryNumber || '').toLowerCase().includes(s);
}

// Assign inventory to this mountain (optionally to a project). Unassigning is
// done from the Inventory tab by opening an item and editing it.
export function AssignInventoryModal({ mountainId, onClose }: { mountainId: string; onClose: () => void }) {
  const { assets, getMountainById, getProjectsByMountainId, updateAsset, logActivity } = useData();
  const { user } = useUser();
  const actor = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const mountain = getMountainById(mountainId);
  const activeProjects = getProjectsByMountainId(mountainId).filter(p => p.stage !== 'Churned' && p.status !== 'Done');

  const [projectId, setProjectId] = useState(activeProjects.length === 1 ? activeProjects[0].id : '');
  const [search, setSearch] = useState('');

  // Available to assign = not already at this mountain and not deployed elsewhere.
  const available = useMemo(
    () => assets.filter(a => !a.isDraft && a.mountainId !== mountainId && a.inventoryStatus !== 'Deployed' && a.inventoryStatus !== 'Retired' && a.inventoryStatus !== 'In a Build'),
    [assets, mountainId],
  );
  const list = available.filter(a => !search || matches(a, search));

  const assign = (a: Asset) => {
    const proj = activeProjects.find(p => p.id === projectId);
    updateAsset(a.id, {
      mountainId,
      projectId: projectId || undefined,
      inventoryStatus: 'Deployed',
      deploymentLog: [...(a.deploymentLog || []), { mountainName: mountain?.name || '', timestamp: new Date().toISOString(), by: actor, action: 'Checked out' }],
    });
    logActivity(mountainId, 'assigned', `Assigned ${assetName(a)}${proj ? ` → ${proj.name}` : ''}`);
    toast.success(`Assigned ${assetName(a)}`);
    setSearch('');
  };

  const onEnter = () => {
    if (list.length === 1) assign(list[0]);
    else if (list.length === 0) toast.error('No matching item');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg h-[85vh] sm:h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Assign inventory · {mountain?.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
        </div>

        <div className="px-5 pt-4 space-y-3">
          {activeProjects.length > 0 && (
            <div>
              <label className="block text-[11px] text-[#6a7282] uppercase tracking-wide mb-1">Project</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[14px] text-[#0a0a0a] outline-none">
                <option value="">No project (mountain only)</option>
                {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5">
            <Search size={15} className="text-[#6a7282]" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
              placeholder="Scan or search by name / serial / YIN…"
              className="flex-1 bg-transparent outline-none text-[14px] text-[#0a0a0a]"
            />
          </div>
          <p className="text-[11px] text-[#8992a0]">To unassign an item, open it in the Inventory tab and edit its assignment.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {list.length === 0 ? (
            <div className="text-center py-10 text-[13px] text-[#6a7282]">No unassigned items to assign.</div>
          ) : (
            list.map(a => (
              <button key={a.id} onClick={() => assign(a)} className="w-full text-left bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2.5 active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{assetName(a)}</div>
                  <div className="text-[11px] text-[#6a7282]">{[a.yullrInventoryNumber, a.serialNumber].filter(Boolean).join(' · ') || a.type}</div>
                </div>
                <span className="text-[12px] font-['Inter:Medium',sans-serif] shrink-0 text-[#ff5c39]">Assign</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
