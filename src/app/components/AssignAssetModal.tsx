import { useState } from 'react';
import { X, Camera, Wifi, Box, Server, Check } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { Asset } from '../context/DataContext';

type AssetType = Asset['type'];

const TYPE_TABS: AssetType[] = ['Camera', 'Network Gear', 'Server', 'Miscellaneous'];

const TYPE_ICONS = {
  Camera,
  'Network Gear': Wifi,
  Miscellaneous: Box,
  Server,
};

const TYPE_COLORS: Record<AssetType, string> = {
  Camera: 'bg-[#fff3f0] text-[#ff5c39]',
  'Network Gear': 'bg-[#eff6ff] text-[#3b82f6]',
  Server: 'bg-[#f0fdf4] text-[#22c55e]',
  Miscellaneous: 'bg-[#f5f5f5] text-[#6a7282]',
};

interface Props {
  mountainId: string;
  locationId: string;
  onClose: () => void;
}

export function AssignAssetModal({ mountainId, locationId, onClose }: Props) {
  const { assets, locations, updateAsset } = useData();
  const [activeTab, setActiveTab] = useState<AssetType>('Camera');
  const [assigning, setAssigning] = useState<string | null>(null);

  // All assets for this mountain (by mountainId or by locationId → location.mountainId)
  const loc = locations.find(l => l.id === locationId);
  const mountainAssets = assets.filter(a => {
    if (a.mountainId === mountainId) return true;
    // Backward compat: derive via location
    if (a.locationId) {
      const assetLoc = locations.find(l => l.id === a.locationId);
      return assetLoc?.mountainId === mountainId;
    }
    return false;
  });

  // Already assigned to this location
  const alreadyAssigned = new Set(
    assets.filter(a => a.locationId === locationId).map(a => a.id)
  );

  const filtered = mountainAssets.filter(a => a.type === activeTab);

  const handleAssign = (asset: Asset) => {
    if (alreadyAssigned.has(asset.id)) {
      // Unassign
      updateAsset(asset.id, { locationId: undefined });
    } else {
      // Assign
      setAssigning(asset.id);
      updateAsset(asset.id, { locationId });
      setTimeout(() => setAssigning(null), 600);
    }
  };

  function assetLabel(a: Asset) {
    const parts = [a.manufacturer, a.model].filter(Boolean);
    if (parts.length) return parts.join(' ');
    return a.type;
  }

  function assetSubLabel(a: Asset) {
    if (a.serialNumber) return `S/N: ${a.serialNumber}`;
    if (a.ipAddress) return a.ipAddress;
    return null;
  }

  function assignmentBadge(a: Asset) {
    if (a.locationId === locationId) return null; // assigned here — no badge needed
    if (a.locationId) {
      const otherLoc = locations.find(l => l.id === a.locationId);
      return otherLoc ? `Assigned: ${otherLoc.name}` : 'Assigned elsewhere';
    }
    return 'Unassigned';
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 flex items-center gap-3">
        <button onClick={onClose} className="p-1 active:opacity-60">
          <X size={24} className="text-[#0a0a0a]" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Assign from Inventory</h2>
          {loc && <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] truncate">{loc.name}</p>}
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex border-b border-[rgba(0,0,0,0.08)] bg-white overflow-x-auto shrink-0">
        {TYPE_TABS.map(tab => {
          const Icon = TYPE_ICONS[tab];
          const count = mountainAssets.filter(a => a.type === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[13px] font-['Inter:Medium',sans-serif] font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#ff5c39] text-[#ff5c39]'
                  : 'border-transparent text-[#6a7282]'
              }`}
            >
              <Icon size={14} />
              {tab}
              {count > 0 && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-[#fff3f0] text-[#ff5c39]' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Asset list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {(() => { const Icon = TYPE_ICONS[activeTab]; return <Icon size={40} className="text-[#d1d5db] mb-3" />; })()}
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">
              No {activeTab} assets in inventory yet.
            </p>
            <p className="text-[#9ca3af] font-['Inter:Regular',sans-serif] text-[13px] mt-1">
              Add assets to the mountain inventory first.
            </p>
          </div>
        ) : (
          filtered.map(asset => {
            const isAssignedHere = alreadyAssigned.has(asset.id);
            const badge = assignmentBadge(asset);
            const Icon = TYPE_ICONS[asset.type];
            return (
              <button
                key={asset.id}
                onClick={() => handleAssign(asset)}
                className={`w-full flex items-center gap-3 p-4 rounded-[12px] border text-left transition-colors active:opacity-70 ${
                  isAssignedHere
                    ? 'border-[#ff5c39] bg-[#fff3f0]'
                    : 'border-[rgba(0,0,0,0.1)] bg-white'
                }`}
              >
                <div className={`w-10 h-10 rounded-[8px] flex items-center justify-center flex-shrink-0 ${TYPE_COLORS[asset.type]}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] truncate">
                    {assetLabel(asset)}
                  </p>
                  {assetSubLabel(asset) && (
                    <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{assetSubLabel(asset)}</p>
                  )}
                  {!isAssignedHere && badge && (
                    <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif] ${
                      badge === 'Unassigned'
                        ? 'bg-[#f0fdf4] text-[#22c55e]'
                        : 'bg-[#fffbeb] text-[#d97706]'
                    }`}>
                      {badge}
                    </span>
                  )}
                </div>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isAssignedHere ? 'bg-[#ff5c39]' : 'border-2 border-[#d1d5db]'
                }`}>
                  {isAssignedHere && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Done */}
      <div className="p-4 border-t border-[rgba(0,0,0,0.08)]">
        <button
          onClick={onClose}
          className="w-full bg-[#0a0a0a] text-white rounded-[10px] py-3.5 font-['Inter:Medium',sans-serif] font-medium text-[16px] active:opacity-80"
        >
          Done
        </button>
      </div>
    </div>
  );
}
