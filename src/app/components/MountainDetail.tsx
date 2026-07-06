import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Asset } from '../context/DataContext';
import {
  ArrowLeft, Plus, Info, MapPin, Building2, ClipboardList, Map,
  Download, FileText, Camera, Wifi, Box, Server, Package,
  ChevronRight, GitMerge, X, DollarSign, Tag, Hash, Globe,
  Calendar, Truck, Barcode, Cpu,
} from 'lucide-react';
import { MountainNotes } from './MountainNotes';
import { MountainDocuments } from './MountainDocuments';
import { MountainMapView } from './MountainMapView';
import { ExportModal } from './ExportModal';
import { toast } from 'sonner';

const ASSET_TYPE_COLORS: Record<string, string> = {
  Camera: 'bg-[#fff3f0] text-[#ff5c39]',
  'Network Gear': 'bg-[#eff6ff] text-[#3b82f6]',
  Server: 'bg-[#f0fdf4] text-[#22c55e]',
  Miscellaneous: 'bg-[#f5f5f5] text-[#6a7282]',
};
const ASSET_ICONS = { Camera, 'Network Gear': Wifi, Miscellaneous: Box, Server };

export function MountainDetail() {
  const { mountainId } = useParams();
  const navigate = useNavigate();
  const {
    getMountainById,
    getTrailsByMountainId,
    getLocationsByMountainId,
    getAssetsByMountainId,
    getAssetsByLocationId,
    assets,
    updateLocation,
    updateMountain,
  } = useData();

  const mountain = getMountainById(mountainId!);
  const trails = getTrailsByMountainId(mountainId!);
  const allLocations = getLocationsByMountainId(mountainId!);
  const inventoryAssets = getAssetsByMountainId(mountainId!).filter(a => a.type !== 'Miscellaneous');
  const [showMap, setShowMap] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [assigningLocationId, setAssigningLocationId] = useState<string | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<Asset | null>(null);

  if (!mountain) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Mountain not found</p>
          <button onClick={() => navigate('/')} className="mt-4 text-[#307fe2] font-['Inter:Medium',sans-serif]">
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Locations not linked to any trail by ID and with no matching trail by name
  const unlinkedLocations = allLocations.filter(
    l => !l.trailId && !trails.some(t => t.name === l.trailName)
  );

  // Inventory breakdown by type (for summary pills)
  const invByType = inventoryAssets.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  const inventoryTotalCost = inventoryAssets.reduce((sum, a) => sum + (a.cost || 0), 0);
  const fmtCost = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-[#f9fafb]">

      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate('/')} className="p-1.5 active:opacity-60">
            <ArrowLeft size={22} className="text-[#0a0a0a]" />
          </button>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px] flex-1 truncate">
            {mountain.name}
          </h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate(`/mountains/${mountainId}/proposal`)}
              className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"
              aria-label="Build Proposal"
              title="Build Proposal"
            >
              <FileText size={18} className="text-[#ff5c39]" />
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"
              aria-label="Export Reports"
              title="Export Reports"
            >
              <Download size={18} className="text-[#1e3a5f]" />
            </button>
            <button
              onClick={() => setShowMap(true)}
              className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"
              aria-label="Map view"
              title="Map view"
            >
              <Map size={18} className="text-[#0a0a0a]" />
            </button>
            <button
              onClick={() => navigate(`/mountains/${mountainId}/edit`)}
              className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"
              aria-label="Edit mountain"
              title="Edit mountain"
            >
              <Info size={18} className="text-[#0a0a0a]" />
            </button>
          </div>
        </div>
        <div className="pl-8">
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
            {mountain.address}
          </p>
          {mountain.parentOrganization && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Building2 size={13} className="text-[#6a7282]" />
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">
                {mountain.parentOrganization}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">

        {/* Portal notifications */}
        {mountain.proposedInstallDates && mountain.proposedInstallDates.length > 0 && !mountain.confirmedInstallDate && (
          <div className="bg-[#fff3e0] border border-[#fcd34d] rounded-[12px] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#92400e]">
                  📅 {mountain.proposedInstallDates.length} proposed install date{mountain.proposedInstallDates.length !== 1 ? 's' : ''} — confirm one
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {mountain.proposedInstallDates.map(d => (
                    <button
                      key={d}
                      onClick={() => {
                        updateMountain(mountainId!, { confirmedInstallDate: d, proposedInstallDates: [] });
                        toast.success('Install date confirmed');
                      }}
                      className="text-[12px] bg-white border border-[#fcd34d] text-[#92400e] px-3 py-1.5 rounded-full font-['Inter:Medium',sans-serif] active:bg-[#fef3c7]"
                    >
                      {new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — Confirm
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {mountain.confirmedInstallDate && (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[12px] px-4 py-3 flex items-center justify-between">
            <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#16a34a]">
              ✓ Install confirmed: {new Date(mountain.confirmedInstallDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <button onClick={() => updateMountain(mountainId!, { confirmedInstallDate: undefined })} className="text-[12px] text-[#6a7282]">Clear</button>
          </div>
        )}

        {/* Top Row: Trails + Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Trails Pane ── */}
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                Trails
                {trails.length > 0 && (
                  <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({trails.length})</span>
                )}
              </h2>
              <button
                onClick={() => navigate(`/mountains/${mountainId}/trails/new`)}
                className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
              >
                <Plus size={14} />
                Add
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {trails.length === 0 ? (
                <div className="py-8 text-center">
                  <MapPin className="mx-auto mb-3 text-[#6a7282]" size={32} />
                  <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
                    No trails yet
                  </p>
                </div>
              ) : (
                <>
                  {trails.map(trail => {
                    const trailLocations = allLocations.filter(
                      l => l.trailId === trail.id || (!l.trailId && l.trailName === trail.name)
                    );
                    const assetCount = trailLocations.reduce((sum, loc) => {
                      return sum + getAssetsByLocationId(loc.id).filter(a => a.type !== 'Miscellaneous').length;
                    }, 0);
                    const inspCount = trailLocations.reduce((sum, loc) => {
                      return sum + (loc.inspection?.items.reduce((s, i) => s + i.count, 0) || 0);
                    }, 0);

                    return (
                      <button
                        key={trail.id}
                        onClick={() => navigate(`/mountains/${mountainId}/trails/${trail.id}`)}
                        className="w-full bg-[#f9fafb] rounded-[8px] border border-[rgba(0,0,0,0.08)] p-3 text-left active:bg-[#f3f3f5] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-8 h-8 bg-[#fff3f0] rounded-[6px] flex items-center justify-center flex-shrink-0">
                            <MapPin size={14} className="text-[#ff5c39]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
                              {trail.name}
                            </p>
                            {trail.notes && (
                              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[11px] truncate mt-0.5">
                                {trail.notes}
                              </p>
                            )}
                          </div>
                          <ChevronRight size={16} className="text-[#d1d5db] flex-shrink-0" />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="bg-white text-[#6a7282] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                            {trailLocations.length} location{trailLocations.length !== 1 ? 's' : ''}
                          </span>
                          {assetCount > 0 && (
                            <span className="bg-[#FFe0D9] text-[#ff5c39] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                              {assetCount} asset{assetCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          {inspCount > 0 && (
                            <span className="bg-white text-[#0a0a0a] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                              <ClipboardList size={9} />
                              {inspCount} insp.
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Unlinked locations */}
                  {unlinkedLocations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.06)]">
                      <p className="text-[#6a7282] font-['Inter:Medium',sans-serif] text-[11px] uppercase tracking-wide mb-2">
                        Standalone
                      </p>
                      <div className="space-y-1.5">
                        {unlinkedLocations.map(loc => {
                          const locAssets = getAssetsByLocationId(loc.id).filter(a => a.type !== 'Miscellaneous');
                          const isAssigning = assigningLocationId === loc.id;
                          return (
                            <div key={loc.id}>
                              <button
                                onClick={() => navigate(`/mountains/${mountainId}/locations/${loc.id}`)}
                                className="w-full bg-white rounded-[6px] border border-[rgba(0,0,0,0.08)] p-2 text-left active:bg-[#f9fafb]"
                              >
                                <div className="flex items-center gap-2">
                                  <MapPin size={13} className="text-[#6a7282] flex-shrink-0" />
                                  <span className="flex-1 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[12px] truncate">{loc.name}</span>
                                  {loc.difficulty && (
                                    <span className="bg-[#f3f3f5] text-[#0a0a0a] text-[10px] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif]">
                                      D{loc.difficulty}
                                    </span>
                                  )}
                                  {locAssets.length > 0 && (
                                    <span className="bg-[#FFe0D9] text-[#ff5c39] text-[10px] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif]">
                                      {locAssets.length}
                                    </span>
                                  )}
                                  <ChevronRight size={13} className="text-[#d1d5db] flex-shrink-0" />
                                </div>
                              </button>
                              {trails.length > 0 && (
                                <div className="ml-1 mt-0.5">
                                  {!isAssigning ? (
                                    <button
                                      onClick={() => setAssigningLocationId(loc.id)}
                                      className="flex items-center gap-1 text-[#307fe2] font-['Inter:Regular',sans-serif] text-[10px] py-0.5 active:opacity-60"
                                    >
                                      <GitMerge size={10} />
                                      Assign
                                    </button>
                                  ) : (
                                    <div className="bg-white rounded-[8px] border border-[#307fe2]/30 p-2 space-y-1.5 mt-1">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[11px]">
                                          Assign to:
                                        </p>
                                        <button onClick={() => setAssigningLocationId(null)} className="p-0.5 active:opacity-60">
                                          <X size={12} className="text-[#6a7282]" />
                                        </button>
                                      </div>
                                      <div className="space-y-1">
                                        {trails.map(trail => (
                                          <button
                                            key={trail.id}
                                            onClick={() => {
                                              updateLocation(loc.id, { trailId: trail.id, trailName: trail.name });
                                              setAssigningLocationId(null);
                                              toast.success(`Assigned to ${trail.name}`);
                                            }}
                                            className="w-full flex items-center gap-1.5 bg-[#f9fafb] rounded-[6px] px-2 py-1.5 text-left active:bg-[#eee] transition-colors"
                                          >
                                            <MapPin size={11} className="text-[#ff5c39] flex-shrink-0" />
                                            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[12px] flex-1 truncate">{trail.name}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Notes Pane ── */}
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
            <MountainNotes mountainId={mountainId!} />
          </div>

        </div>

        {/* Bottom Row: Inventory (left) + Documents (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Inventory */}
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                Inventory
                {inventoryAssets.length > 0 && (
                  <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({inventoryAssets.length})</span>
                )}
              </h2>
              {inventoryTotalCost > 0 && (
                <p className="text-[#6a7282] text-[12px] mt-0.5">{fmtCost(inventoryTotalCost)} total value</p>
              )}
            </div>
          </div>

          {inventoryAssets.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="mx-auto mb-3 text-[#6a7282]" size={32} />
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
                No inventory assigned. Add items via the Admin panel.
              </p>
            </div>
          ) : (
            <>
              {/* Summary pills */}
              {Object.keys(invByType).length > 0 && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {Object.entries(invByType).map(([type, count]) => {
                    const Icon = ASSET_ICONS[type as keyof typeof ASSET_ICONS] || Box;
                    return (
                      <span
                        key={type}
                        className={`flex items-center gap-1.5 text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full ${ASSET_TYPE_COLORS[type] || 'bg-[#f3f3f5] text-[#6a7282]'}`}
                      >
                        <Icon size={11} />
                        {count} {type}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Asset grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {inventoryAssets.map(asset => {
                  const Icon = ASSET_ICONS[asset.type as keyof typeof ASSET_ICONS] || Box;
                  const assignedLoc = asset.locationId
                    ? allLocations.find(l => l.id === asset.locationId)
                    : null;
                  const label = [asset.manufacturer || asset.customManufacturer, asset.model || asset.customModel].filter(Boolean).join(' ') || asset.type;
                  return (
                    <button
                      key={asset.id}
                      onClick={() => {
                        if (asset.inventoryCategory || asset.yullrInventoryNumber) {
                          setSelectedInventoryItem(asset);
                        } else if (asset.locationId) {
                          navigate(`/mountains/${mountainId}/locations/${asset.locationId}/assets/${asset.id}`);
                        }
                      }}
                      className="bg-[#f9fafb] rounded-[8px] border border-[rgba(0,0,0,0.08)] p-3 text-left active:bg-[#f3f3f5] transition-colors"
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0 ${ASSET_TYPE_COLORS[asset.type] || 'bg-[#f3f3f5] text-[#6a7282]'}`}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[12px] line-clamp-2 mb-0.5">{label}</p>
                          {asset.serialNumber && (
                            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[10px] truncate">S/N: {asset.serialNumber}</p>
                          )}
                        </div>
                      </div>
                      {assignedLoc && (
                        <span className="text-[10px] bg-white text-[#ff5c39] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif] inline-block">
                          {assignedLoc.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          </div>

          {/* Documents */}
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
            <MountainDocuments mountainId={mountainId!} />
          </div>

        </div>

      </div>

      {showMap && <MountainMapView mountainId={mountainId!} onClose={() => setShowMap(false)} />}
      {showExport && <ExportModal mountainId={mountainId!} onClose={() => setShowExport(false)} />}
      {selectedInventoryItem && (
        <InventoryItemDetailModal
          asset={selectedInventoryItem}
          allAssets={assets}
          onClose={() => setSelectedInventoryItem(null)}
        />
      )}

    </div>
  );
}

// ─── Inventory Item Detail Modal ─────────────────────────────────────────────

function InventoryItemDetailModal({
  asset,
  allAssets,
  onClose,
}: {
  asset: Asset;
  allAssets: Asset[];
  onClose: () => void;
}) {
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const isServer = asset.inventorySubcategory === 'Complete Server';
  const components = isServer
    ? (asset.serverComponentIds || []).map(id => allAssets.find(a => a.id === id)).filter(Boolean) as Asset[]
    : [];

  const displayName = [asset.customManufacturer || asset.manufacturer, asset.customModel || asset.model]
    .filter(Boolean).join(' ') || asset.inventorySubcategory || asset.inventoryCategory || asset.type;

  function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-[rgba(0,0,0,0.05)] last:border-0">
        <div className="w-7 shrink-0 text-[#6a7282] mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-[#6a7282] uppercase tracking-wide font-['Inter:Medium',sans-serif] mb-0.5">{label}</p>
          <p className="text-[14px] text-[#0a0a0a] font-['Inter:Regular',sans-serif] break-words">{value}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[17px] truncate">{displayName}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {asset.yullrInventoryNumber && (
                <span className="text-[11px] font-mono text-[#6a7282] bg-[#f3f3f5] px-2 py-0.5 rounded-full">{asset.yullrInventoryNumber}</span>
              )}
              {asset.inventoryCategory && (
                <span className="text-[11px] text-[#6a7282]">{asset.inventoryCategory}{asset.inventorySubcategory ? ` · ${asset.inventorySubcategory}` : ''}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5] active:bg-[#e5e7eb] shrink-0">
            <X size={16} className="text-[#6a7282]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {/* Cost */}
          {asset.cost !== undefined && asset.cost > 0 && (
            <div className="bg-[#f9fafb] rounded-[10px] px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] uppercase tracking-wide">
                {isServer ? 'Build Cost' : 'Cost'}
              </span>
              <span className="text-[18px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{fmt(asset.cost)}</span>
            </div>
          )}

          <div>
            {asset.manufacturer || asset.customManufacturer ? (
              <Row icon={<Tag size={14} />} label="Manufacturer" value={asset.customManufacturer || asset.manufacturer} />
            ) : null}
            {asset.model || asset.customModel ? (
              <Row icon={<Tag size={14} />} label="Model" value={asset.customModel || asset.model} />
            ) : null}
            {asset.serialNumber && (
              <Row icon={<Hash size={14} />} label="Serial Number" value={<span className="font-mono">{asset.serialNumber}</span>} />
            )}
            {asset.ipAddress && (
              <Row icon={<Globe size={14} />} label="IP Address" value={<span className="font-mono">{asset.ipAddress}</span>} />
            )}
            {asset.upc && (
              <Row icon={<Barcode size={14} />} label="UPC" value={<span className="font-mono">{asset.upc}</span>} />
            )}
            {asset.vendor && (
              <Row icon={<Truck size={14} />} label="Vendor" value={asset.vendor} />
            )}
            {asset.dateOfPurchase && (
              <Row icon={<Calendar size={14} />} label="Date of Purchase" value={asset.dateOfPurchase} />
            )}
            {asset.dateAddedToInventory && (
              <Row icon={<Calendar size={14} />} label="Date Added to Inventory" value={asset.dateAddedToInventory} />
            )}
            {asset.mountainDeployment && (
              <Row icon={<Building2 size={14} />} label="Deployed At" value={asset.mountainDeployment} />
            )}
            {asset.notes && (
              <Row icon={<FileText size={14} />} label="Notes" value={asset.notes} />
            )}
          </div>

          {/* Server components */}
          {isServer && components.length > 0 && (
            <div className="mt-4">
              <p className="text-[12px] text-[#6a7282] uppercase tracking-wide font-['Inter:Medium',sans-serif] mb-2">
                Components ({components.length})
              </p>
              <div className="border border-[rgba(0,0,0,0.08)] rounded-[10px] divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden">
                {components.map(comp => (
                  <div key={comp.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Cpu size={13} className="text-[#6a7282] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#0a0a0a] font-['Inter:Medium',sans-serif] truncate">
                        {[comp.customManufacturer || comp.manufacturer, comp.customModel || comp.model].filter(Boolean).join(' ') || comp.inventorySubcategory || 'Component'}
                      </p>
                      <p className="text-[11px] text-[#6a7282]">
                        {comp.inventorySubcategory}{comp.serialNumber ? ` · ${comp.serialNumber}` : ''}{comp.yullrInventoryNumber ? ` · ${comp.yullrInventoryNumber}` : ''}
                      </p>
                    </div>
                    {comp.cost !== undefined && (
                      <span className="text-[12px] text-[#6a7282] shrink-0">{fmt(comp.cost)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment history */}
          {(asset.deploymentLog?.length ?? 0) > 1 && (
            <div className="mt-4">
              <p className="text-[12px] text-[#6a7282] uppercase tracking-wide font-['Inter:Medium',sans-serif] mb-2">Deployment History</p>
              <div className="space-y-1">
                {[...asset.deploymentLog!].reverse().map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px]">
                    <span className="text-[#0a0a0a]">{entry.mountainName}</span>
                    <span className="text-[#6a7282]">{new Date(entry.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)]">
          <button
            onClick={onClose}
            className="w-full bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:bg-[#e5e7eb]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}