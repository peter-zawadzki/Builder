import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { X, Hash, PackageCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { Asset } from '../context/DataContext';

function assetName(a: Asset) {
  return [a.customManufacturer || a.manufacturer, a.customModel || a.model].filter(Boolean).join(' ')
    || a.inventorySubcategory || a.inventoryCategory || a.type;
}

// Assign inventory to this mountain by serial number only — no browsing the
// unassigned list. If multiple unassigned items share a serial (bulk/UPC-
// scanned product), any one of them is attached; the user never picks.
// Unassigning is done from the Inventory tab by opening an item and editing it.
export function AssignInventoryModal({ mountainId, onClose }: { mountainId: string; onClose: () => void }) {
  const { assets, getMountainById, getProjectsByMountainId, updateAsset, logActivity } = useData();
  const { user } = useUser();
  const actor = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const mountain = getMountainById(mountainId);
  const activeProjects = getProjectsByMountainId(mountainId).filter(p => p.stage !== 'Churned' && p.status !== 'Done');

  const [projectId, setProjectId] = useState(activeProjects.length === 1 ? activeProjects[0].id : '');
  const [serial, setSerial] = useState('');
  const [lastAssigned, setLastAssigned] = useState<string | null>(null);

  const assignBySerial = () => {
    const query = serial.trim().toLowerCase();
    if (!query) return;

    // Unassigned = not already at a mountain, not deployed/retired/in a build.
    const candidates = assets.filter(a =>
      !a.isDraft &&
      a.mountainId !== mountainId &&
      a.inventoryStatus !== 'Deployed' && a.inventoryStatus !== 'Retired' && a.inventoryStatus !== 'In a Build' &&
      (a.serialNumber || '').trim().toLowerCase() === query,
    );

    if (candidates.length === 0) {
      toast.error('No unassigned item found with that serial number');
      return;
    }

    // Multiple matches (bulk/UPC-scanned items share a serial) — attach any one.
    const asset = candidates[0];
    const proj = activeProjects.find(p => p.id === projectId);
    updateAsset(asset.id, {
      mountainId,
      projectId: projectId || undefined,
      inventoryStatus: 'Deployed',
      deploymentLog: [...(asset.deploymentLog || []), { mountainName: mountain?.name || '', timestamp: new Date().toISOString(), by: actor, action: 'Checked out' }],
    });
    logActivity(mountainId, 'assigned', `Assigned ${assetName(asset)}${proj ? ` → ${proj.name}` : ''}`);
    toast.success(`Assigned ${assetName(asset)}`);
    setLastAssigned(assetName(asset));
    setSerial('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-md flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Assign inventory · {mountain?.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {activeProjects.length > 0 && (
            <div>
              <label className="block text-[11px] text-[#6a7282] uppercase tracking-wide mb-1">Project</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[14px] text-[#0a0a0a] outline-none">
                <option value="">No project (mountain only)</option>
                {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-[#6a7282] uppercase tracking-wide mb-1">Serial Number</label>
            <div className="flex items-center gap-2 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5">
              <Hash size={15} className="text-[#6a7282]" />
              <input
                autoFocus
                value={serial}
                onChange={e => setSerial(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); assignBySerial(); } }}
                placeholder="Scan or type a serial number…"
                className="flex-1 bg-transparent outline-none text-[14px] text-[#0a0a0a] font-mono"
              />
            </div>
            <p className="text-[11px] text-[#8992a0] mt-1.5">Finds the matching unassigned item and attaches it — no list to browse.</p>
          </div>

          <button
            onClick={assignBySerial}
            disabled={!serial.trim()}
            className="w-full flex items-center justify-center gap-2 bg-[#ff5c39] text-white rounded-[8px] py-3 text-[14px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-40"
          >
            <PackageCheck size={16} /> Assign
          </button>

          {lastAssigned && (
            <div className="bg-[#eaf5ef] text-[#3f7a5c] rounded-[8px] px-3 py-2.5 text-[13px]">
              Assigned <strong>{lastAssigned}</strong>. Scan the next item, or close when done.
            </div>
          )}

          <p className="text-[11px] text-[#8992a0]">To unassign an item, open it in the Inventory tab and edit its assignment.</p>
        </div>
      </div>
    </div>
  );
}
