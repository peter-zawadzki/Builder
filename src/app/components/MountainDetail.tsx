import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import {
  ArrowLeft, Plus, Info, MapPin, Building2, ClipboardList, Map, Download,
} from 'lucide-react';
import { MountainNotes } from './MountainNotes';
import { MountainMapView } from './MountainMapView';
import { ExportModal } from './ExportModal';

export function MountainDetail() {
  const { mountainId } = useParams();
  const navigate = useNavigate();
  const {
    getMountainById,
    getLocationsByMountainId,
    getAssetsByLocationId,
  } = useData();

  const mountain = getMountainById(mountainId!);
  const locations = getLocationsByMountainId(mountainId!);
  const [showMap, setShowMap] = useState(false);
  const [showExport, setShowExport] = useState(false);

  if (!mountain) {
    return (
      <div className="min-h-screen bg-[#F2F3F5] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif]">Mountain not found</p>
          <button onClick={() => navigate('/')} className="mt-4 text-[#307FE2] font-['Inter:Medium',sans-serif]">
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F3F5]">

      {/* Header */}
      <div className="bg-white border-b border-[rgba(29,41,48,0.08)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/')} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#1D2930]" />
          </button>
          <h1 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[20px] flex-1">
            {mountain.name}
          </h1>
          <button
            onClick={() => setShowMap(true)}
            className="p-2 bg-[#F2F3F5] rounded-[8px] active:bg-[#E8E9EA]"
            aria-label="Map view"
          >
            <Map size={20} className="text-[#1D2930]" />
          </button>
          <Link to={`/mountains/${mountainId}/edit`}>
            <button className="p-2 bg-[#F2F3F5] rounded-[8px] active:bg-[#E8E9EA]">
              <Info size={20} className="text-[#1D2930]" />
            </button>
          </Link>
        </div>
        <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[14px] pl-9">
          {mountain.address}
        </p>
        {mountain.parentOrganization && (
          <div className="flex items-center gap-2 pl-9 mt-1">
            <Building2 size={14} className="text-[#6D7B83]" />
            <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">
              {mountain.parentOrganization}
            </p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">

        {/* ── Locations ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
              Locations
            </h2>
          </div>

          <Link to={`/mountains/${mountainId}/locations/new`}>
            <button className="w-full bg-[#F95C39] text-white rounded-[10px] px-4 py-3.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium mb-3 active:opacity-80">
              <Plus size={20} />
              Add Location
            </button>
          </Link>

          {locations.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-8 text-center">
              <MapPin className="mx-auto mb-4 text-[#6D7B83]" size={48} />
              <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif]">
                No locations yet. Add your first location to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {locations.map((location) => {
                const locationAssets = getAssetsByLocationId(location.id);
                const assetCount = locationAssets.filter(a => a.type !== 'Miscellaneous').length;
                const inspCount = location.inspection?.items.reduce((s, i) => s + i.count, 0) || 0;
                const hasAssets = assetCount > 0;
                const hasInspection = !!location.inspection && inspCount > 0;

                return (
                  <Link key={location.id} to={`/mountains/${mountainId}/locations/${location.id}`}>
                    <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4 active:bg-[#F2F3F5] transition-colors">
                      <div className="flex items-start gap-3">
                        <MapPin size={20} className="text-[#F95C39] flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                            {location.name}
                          </h3>
                          {location.trailName && (
                            <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px] mt-0.5">
                              {location.trailName}
                            </p>
                          )}
                          {(hasAssets || hasInspection) && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {hasAssets && (
                                <span className="bg-[#FFEDE9] text-[#F95C39] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full">
                                  Installed Assets {assetCount}
                                </span>
                              )}
                              {hasInspection && (
                                <span className="bg-[#F2F3F5] text-[#1D2930] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                                  <ClipboardList size={11} />
                                  Inspection Items {inspCount}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <MountainNotes mountainId={mountainId!} />

        {/* ── Export ── */}
        <button
          onClick={() => setShowExport(true)}
          className="w-full flex items-center justify-center gap-2 bg-[#1D2930] text-white rounded-[10px] px-4 py-3.5 font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
        >
          <Download size={18} />
          Export Reports
        </button>

      </div>

      {/* ── Map View Overlay ── */}
      {showMap && (
        <MountainMapView mountainId={mountainId!} onClose={() => setShowMap(false)} />
      )}

      {/* ── Export Modal ── */}
      {showExport && (
        <ExportModal mountainId={mountainId!} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}