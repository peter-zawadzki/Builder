import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import { Plus, Mountain, Settings, FileText, MapPin, Camera, Map, X, ExternalLink, StickyNote, Receipt, ArrowUpDown, Users, UserPlus, Database, Boxes, Wrench, Search, Building2, Navigation } from 'lucide-react';
import { UserButton } from '@clerk/clerk-react';
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useIsSuperAdmin } from '../hooks/useRole';
import { SalesProcessBar } from './SalesProcessBar';
import { QuickNotesModal } from './QuickNotesModal';
import { ProjectMiniBar } from './projects/ProjectsPane';
import { StageBadge } from './crm/CRM';
import { toast } from 'sonner';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const AUTH_HEADER = { Authorization: `Bearer ${publicAnonKey}` };

interface MapViewState {
  mountainName: string;
  loading: boolean;
  url: string | null;
  mimeType: string | null;
  error: string | null;
}

export function MountainsList() {
  const { mountains, trails, assets, projects, contacts, organizations, getNotesByMountainId, getLocationsByMountainId, getInspectionsByLocationId, getProjectsByMountainId, updateMountain } = useData();
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();

  const [mapView, setMapView] = useState<MapViewState | null>(null);
  const [notesModalMountainId, setNotesModalMountainId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // State abbreviation to full name mapping
  const STATE_NAMES: Record<string, string> = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
  };

  // Extract state abbreviation from address (looks for 2-letter state code)
  const extractState = (address: string): string | null => {
    const match = address.match(/\b([A-Z]{2})\b\s+\d{5}/); // Match state code before zip
    return match ? match[1] : null;
  };

  // Format timestamp for tooltip
  const formatTimestamp = (timestamp?: string): string => {
    if (!timestamp) return 'Never updated';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (diffMinutes < 60) {
      return `Last updated ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago (${dateStr} at ${timeStr})`;
    } else if (diffHours < 24) {
      return `Last updated ${diffHours} hour${diffHours !== 1 ? 's' : ''} ago (${dateStr} at ${timeStr})`;
    } else if (diffDays === 1) {
      return `Last updated yesterday (${dateStr} at ${timeStr})`;
    } else if (diffDays < 7) {
      return `Last updated ${diffDays} days ago (${dateStr} at ${timeStr})`;
    } else {
      return `Last updated ${dateStr} at ${timeStr}`;
    }
  };

  // Get most recent activity date for a mountain
  const getMostRecentActivity = (mountainId: string): Date => {
    const mountain = mountains.find(m => m.id === mountainId);
    if (!mountain) return new Date(0);

    const dates: Date[] = [];

    // Last note update
    const notes = getNotesByMountainId(mountainId);
    notes.forEach(note => {
      if (note.createdAt) dates.push(new Date(note.createdAt));
      if (note.updatedAt) dates.push(new Date(note.updatedAt));
      note.entries?.forEach(entry => {
        if (entry.timestamp) dates.push(new Date(entry.timestamp));
      });
    });

    // Last inspection date
    const mountainLocations = getLocationsByMountainId(mountainId);
    mountainLocations.forEach(loc => {
      const latestInspection = getInspectionsByLocationId(loc.id)[0];
      if (latestInspection?.createdAt) {
        dates.push(new Date(latestInspection.createdAt));
      }
    });

    // Proposal created
    if (mountain.proposalCreatedAt) {
      dates.push(new Date(mountain.proposalCreatedAt));
    }

    // Trail map uploaded
    if (mountain.trailMapUploadedAt) {
      dates.push(new Date(mountain.trailMapUploadedAt));
    }

    // Invoice created
    if (mountain.invoice?.date) {
      dates.push(new Date(mountain.invoice.date));
    }

    // Assets created/updated (for this mountain)
    const mountainAssets = assets.filter(a => a.mountainId === mountainId);
    mountainAssets.forEach(asset => {
      // Assets don't currently have timestamps, but if they did we'd include them
    });

    // Trails created (for this mountain)
    const mountainTrails = trails.filter(t => t.mountainId === mountainId);
    mountainTrails.forEach(trail => {
      // Trails don't currently have timestamps, but if they did we'd include them
    });

    return dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date(0);
  };

  // Get activity pill color and text based on days since last activity
  const getActivityPill = (mountainId: string): { color: string; bgColor: string; text: string; days: number; tooltip: string } | null => {
    const lastActivity = getMostRecentActivity(mountainId);
    if (lastActivity.getTime() === 0) return null; // No activity yet

    const now = new Date();
    const diffMs = now.getTime() - lastActivity.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const dateStr = lastActivity.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const tooltip = `Last activity ${days} day${days !== 1 ? 's' : ''} ago (${dateStr})`;

    if (days <= 10) {
      return { color: '#22c55e', bgColor: '#f0fdf4', text: `${days}d`, days, tooltip };
    } else if (days <= 22) {
      return { color: '#f59e0b', bgColor: '#fef3c7', text: `${days}d`, days, tooltip };
    } else {
      return { color: '#ef4444', bgColor: '#fee2e2', text: `${days}d`, days, tooltip };
    }
  };

  // Filter (single search box across mountain name, state, region, owner, status) and sort mountains
  const filteredAndSortedMountains = useMemo(() => {
    let filtered = mountains.filter(m => showArchived ? m.archived : !m.archived);

    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(m => {
        const stateCode = extractState(m.address);
        const stateName = stateCode ? STATE_NAMES[stateCode] || stateCode : '';
        const owners = getProjectsByMountainId(m.id).map(p => p.ownerName).filter(Boolean);
        const haystack = [m.name, m.address, stateCode, stateName, m.region, m.pipelineStage, ...owners]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    // Always alphabetical A–Z.
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    return filtered;
  }, [mountains, search, projects, showArchived]);

  const openMap = async (e: React.MouseEvent, mountainId: string, mountainName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMapView({ mountainName, loading: true, url: null, mimeType: null, error: null });
    try {
      const resp = await fetch(`${API_BASE}/trail-map/${mountainId}`, { headers: AUTH_HEADER });
      const data = await resp.json() as any;
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to load map');
      if (!data.url) throw new Error('No map found');
      setMapView({ mountainName, loading: false, url: data.url, mimeType: data.mimeType, error: null });
    } catch (err: any) {
      setMapView({ mountainName, loading: false, url: null, mimeType: null, error: err.message });
    }
  };

  const openProposal = (e: React.MouseEvent, mountainId: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/mountains/${mountainId}/proposal`);
  };

  const isImage = mapView?.mimeType?.startsWith('image/');
  const isPdf = mapView?.mimeType === 'application/pdf';

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">

      {/* Content */}
      <div className="flex-1 p-4">
        {/* Sort and Filter Controls */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-3 mb-3 space-y-3">
          {/* Search + Add mountain */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by mountain, state, region, owner, or status…"
                className="w-full bg-[#f3f3f5] rounded-[6px] pl-9 pr-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px] border-none outline-none"
              />
            </div>
            <button
              onClick={() => navigate('/mountains/new')}
              className="shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80"
            >
              <Plus size={14} /> Add
            </button>
            <button
              onClick={() => setShowArchived(v => !v)}
              className={`shrink-0 px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${showArchived ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
            >
              Archived
            </button>
          </div>
        </div>

        {mountains.length === 0 ? (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-8 text-center">
            <Mountain className="mx-auto mb-4 text-[#6a7282]" size={48} />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">
              No mountains yet. Add your first mountain to get started.
            </p>
          </div>
        ) : filteredAndSortedMountains.length === 0 ? (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-8 text-center">
            <Mountain className="mx-auto mb-4 text-[#6a7282]" size={48} />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">
              {search ? `No mountains found for "${search}".` : showArchived ? 'No archived mountains.' : 'No mountains found.'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-4 text-[#ff5c39] font-['Inter:Medium',sans-serif] text-[13px] active:opacity-70"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredAndSortedMountains.map((mountain) => {
              const trailCount = trails.filter(t => t.mountainId === mountain.id).length;
              const locationCount = getLocationsByMountainId(mountain.id).length;
              const cameraCount = assets.filter(a => a.mountainId === mountain.id && a.type === 'Camera').length;
              const contactCount = contacts.filter(c => c.mountainId === mountain.id).length;
              const org = mountain.organizationId ? organizations.find(o => o.id === mountain.organizationId) : undefined;
              const mountainNotes = getNotesByMountainId(mountain.id);
              const noteCount = mountainNotes.length;

              // Get most recent note update for Notes tooltip
              const mostRecentNoteUpdate = mountainNotes.reduce((latest: string | undefined, note) => {
                if (!latest) return note.updatedAt || note.createdAt;
                const noteTime = note.updatedAt || note.createdAt;
                return noteTime && noteTime > latest ? noteTime : latest;
              }, undefined as string | undefined);

              const activityPill = getActivityPill(mountain.id);

              return (
                <Link key={mountain.id} to={`/mountains/${mountain.id}`}>
                  <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 active:bg-[#f3f3f5] transition-colors h-full flex flex-col relative">
                    {/* Status pill + activity pill in top right */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <StageBadge stage={mountain.pipelineStage} />
                      {activityPill && (
                        <div
                          className="px-2 py-1 rounded-full text-[10px] font-['Inter:SemiBold',sans-serif] font-semibold"
                          style={{ backgroundColor: activityPill.bgColor, color: activityPill.color }}
                          title={activityPill.tooltip}
                        >
                          {activityPill.text}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 mb-3">
                      <h3 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] line-clamp-2 pr-28">
                        {mountain.name}
                      </h3>
                      {mountain.archived && (
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); updateMountain(mountain.id, { archived: false }); toast.success('Restored'); }}
                          className="self-start text-[11px] text-[#307fe2] font-['Inter:Medium',sans-serif] bg-[#eef3fb] px-2 py-0.5 rounded-full active:opacity-70"
                        >
                          Restore
                        </button>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {org && (
                          <span className="flex items-center gap-1 bg-[#f3edfb] text-[#7c3aed] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                            <Building2 size={10} /> {org.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1 bg-[#f3f3f5] text-[#6a7282] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                          <MapPin size={10} /> {trailCount} trail{trailCount !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1 bg-[#f3f3f5] text-[#6a7282] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                          <Navigation size={10} /> {locationCount} location{locationCount !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1 bg-[#fff3f0] text-[#ff5c39] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                          <Camera size={10} /> {cameraCount} camera{cameraCount !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1 bg-[#eef3fb] text-[#307fe2] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                          <Users size={10} /> {contactCount} contact{contactCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {(mountain.trailMapType || mountain.invoice) && (
                        <div className="flex flex-wrap gap-1.5">
                          {mountain.trailMapType && (
                            <button
                              onClick={e => openMap(e, mountain.id, mountain.name)}
                              className="flex items-center gap-1 bg-[#f0fdf4] text-[#22c55e] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-1 rounded-full active:bg-[#dcfce7] transition-colors"
                              title={formatTimestamp(mountain.trailMapUploadedAt)}
                            >
                              <Map size={9} /> Map
                            </button>
                          )}
                          {mountain.invoice && (
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/mountains/${mountain.id}/invoice`); }}
                              className="flex items-center gap-1 bg-[#fef3c7] text-[#d97706] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-1 rounded-full active:bg-[#fde68a] transition-colors"
                              title={`Invoice created ${mountain.invoice.date}`}
                            >
                              <Receipt size={9} /> Invoice
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] line-clamp-2">
                        {mountain.address}
                      </p>
                      {mountain.region && (
                        <span className="shrink-0 text-[10px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full">{mountain.region}</span>
                      )}
                    </div>
                    <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-2">
                      {mountain.phone}
                    </p>
                    {/* Project status — one bar per project */}
                    <div className="mt-auto">
                      {(() => {
                        const projs = getProjectsByMountainId(mountain.id);
                        if (projs.length === 0) {
                          return <div className="text-[11px] text-[#8992a0]">No projects yet</div>;
                        }
                        return (
                          <div className="space-y-2.5">
                            {projs.map(p => <ProjectMiniBar key={p.id} project={p} />)}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Notes Modal */}
      {notesModalMountainId && (
        <QuickNotesModal
          mountainId={notesModalMountainId}
          onClose={() => setNotesModalMountainId(null)}
        />
      )}

      {/* Trail Map Modal */}
      {mapView && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col"
          onClick={() => setMapView(null)}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-white font-['Inter:Medium',sans-serif] font-medium text-[15px] truncate flex-1 mr-3">
              {mapView.mountainName} — Trail Map
            </p>
            {isPdf && mapView.url && (
              <a
                href={mapView.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-white/20 text-white text-[13px] font-['Inter:Medium',sans-serif] px-3 py-1.5 rounded-[8px] active:bg-white/30 mr-2"
              >
                <ExternalLink size={13} />
                Open PDF
              </a>
            )}
            <button
              onClick={() => setMapView(null)}
              className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center active:bg-white/30 flex-shrink-0"
            >
              <X size={18} className="text-white" />
            </button>
          </div>

          {/* Content */}
          <div
            className="flex-1 flex items-center justify-center p-4 overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            {mapView.loading && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <p className="text-white/70 text-[13px]">Loading map…</p>
              </div>
            )}
            {mapView.error && (
              <div className="bg-white/10 rounded-[12px] px-6 py-8 text-center max-w-xs">
                <Map size={32} className="text-white/40 mx-auto mb-3" />
                <p className="text-white font-['Inter:Medium',sans-serif] text-[14px]">{mapView.error}</p>
              </div>
            )}
            {!mapView.loading && !mapView.error && isImage && mapView.url && (
              <img
                src={mapView.url}
                alt="Trail Map"
                className="max-w-full max-h-full object-contain rounded-[4px]"
              />
            )}
            {!mapView.loading && !mapView.error && isPdf && mapView.url && (
              <div className="bg-white rounded-[16px] p-8 text-center max-w-xs w-full">
                <div className="w-16 h-16 bg-[#fff3f0] rounded-[12px] flex items-center justify-center mx-auto mb-4">
                  <FileText size={32} className="text-[#ff5c39]" />
                </div>
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px] mb-2">PDF Trail Map</p>
                <p className="text-[#6a7282] text-[13px] mb-5">Tap the button below to open this PDF in your browser.</p>
                <a
                  href={mapView.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#ff5c39] text-white font-['Inter:Medium',sans-serif] font-medium text-[14px] px-5 py-3 rounded-[10px] active:opacity-80"
                >
                  <ExternalLink size={15} />
                  Open PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
