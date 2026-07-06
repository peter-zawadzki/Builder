import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import { Plus, Mountain, Settings, FileText, MapPin, Camera, Map, X, ExternalLink, StickyNote, Receipt, ArrowUpDown, Users, UserPlus, Database, Boxes, Wrench } from 'lucide-react';
import { UserButton } from '@clerk/clerk-react';
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useIsSuperAdmin } from '../hooks/useRole';
import { SalesProcessBar } from './SalesProcessBar';
import { QuickNotesModal } from './QuickNotesModal';

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
  const { mountains, trails, assets, getNotesByMountainId, getLocationsByMountainId } = useData();
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();

  const [mapView, setMapView] = useState<MapViewState | null>(null);
  const [notesModalMountainId, setNotesModalMountainId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'activity'>('name');
  const [filterState, setFilterState] = useState<string>('all');

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
      if (loc.inspection?.createdAt) {
        dates.push(new Date(loc.inspection.createdAt));
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

  // Get all unique states from mountains
  const allStates = useMemo(() => {
    const states = new Set<string>();
    mountains.forEach(m => {
      const state = extractState(m.address);
      if (state) states.add(state);
    });
    // Sort by full state name
    return Array.from(states).sort((a, b) => {
      const nameA = STATE_NAMES[a] || a;
      const nameB = STATE_NAMES[b] || b;
      return nameA.localeCompare(nameB);
    });
  }, [mountains]);

  // Filter and sort mountains
  const filteredAndSortedMountains = useMemo(() => {
    let filtered = [...mountains];

    // Filter by state
    if (filterState !== 'all') {
      filtered = filtered.filter(m => extractState(m.address) === filterState);
    }

    // Sort
    if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'activity') {
      filtered.sort((a, b) => {
        const dateA = getMostRecentActivity(a.id);
        const dateB = getMostRecentActivity(b.id);
        return dateB.getTime() - dateA.getTime(); // Most recent first
      });
    }

    return filtered;
  }, [mountains, sortBy, filterState]);

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
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4">
        <div className="flex flex-col items-center justify-center relative">
          <Link to="/"><img src={imgImageYullrLogo} alt="Yullr" className="h-16 mb-3" /></Link>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[24px]">
            Mountain Builder
          </h1>
          {/* Left: signed-in user — identity, sign out, and (super-admin) admin actions */}
          <div className="absolute left-0 top-0 flex items-center h-9">
            <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }}>
              {isSuperAdmin && (
                <UserButton.MenuItems>
                  <UserButton.Action
                    label="Team &amp; invites"
                    labelIcon={<UserPlus size={16} />}
                    onClick={() => navigate('/team')}
                  />
                  <UserButton.Action
                    label="Inspection items"
                    labelIcon={<Wrench size={16} />}
                    onClick={() => navigate('/inspection-items')}
                  />
                  <UserButton.Action
                    label="Local DB check"
                    labelIcon={<Database size={16} />}
                    onClick={() => navigate('/system-check')}
                  />
                </UserButton.MenuItems>
              )}
            </UserButton>
          </div>
          {/* Right: primary navigation — Mountains · People · Inventory */}
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <Link to="/mountains">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Mountains">
                <Mountain size={20} className="text-[#6a7282]" />
              </button>
            </Link>
            <Link to="/crm">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="People &amp; contacts">
                <Users size={20} className="text-[#6a7282]" />
              </button>
            </Link>
            <Link to="/inventory">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Inventory">
                <Boxes size={20} className="text-[#6a7282]" />
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {/* Sort and Filter Controls */}
        {mountains.length > 0 && (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-3 mb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Sort By */}
              <div className="flex-1">
                <label className="block text-[#6a7282] font-['Inter:Medium',sans-serif] text-[11px] mb-1.5 uppercase tracking-wider">
                  Sort By
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSortBy('name')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[6px] text-[13px] font-['Inter:Medium',sans-serif] font-medium transition-colors ${
                      sortBy === 'name'
                        ? 'bg-[#ff5c39] text-white'
                        : 'bg-[#f3f3f5] text-[#6a7282] active:bg-[#e8e8ea]'
                    }`}
                  >
                    <ArrowUpDown size={13} />
                    A-Z
                  </button>
                  <button
                    onClick={() => setSortBy('activity')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[6px] text-[13px] font-['Inter:Medium',sans-serif] font-medium transition-colors ${
                      sortBy === 'activity'
                        ? 'bg-[#ff5c39] text-white'
                        : 'bg-[#f3f3f5] text-[#6a7282] active:bg-[#e8e8ea]'
                    }`}
                  >
                    <ArrowUpDown size={13} />
                    Recent
                  </button>
                </div>
              </div>

              {/* Filter by State */}
              <div className="flex-1">
                <label className="block text-[#6a7282] font-['Inter:Medium',sans-serif] text-[11px] mb-1.5 uppercase tracking-wider">
                  Filter by State
                </label>
                <select
                  value={filterState}
                  onChange={e => setFilterState(e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[6px] px-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px] border-none outline-none"
                >
                  <option value="all">All States ({mountains.length})</option>
                  {allStates.map(state => {
                    const count = mountains.filter(m => extractState(m.address) === state).length;
                    const stateName = STATE_NAMES[state] || state;
                    return (
                      <option key={state} value={state}>
                        {stateName} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>
        )}

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
              No mountains found for the selected state.
            </p>
            <button
              onClick={() => setFilterState('all')}
              className="mt-4 text-[#ff5c39] font-['Inter:Medium',sans-serif] text-[13px] active:opacity-70"
            >
              Clear filter
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredAndSortedMountains.map((mountain) => {
              const trailCount = trails.filter(t => t.mountainId === mountain.id).length;
              const installedCameras = assets.filter(
                a => a.mountainId === mountain.id && a.type === 'Camera' && !!a.locationId
              ).length;
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
                    {/* Activity pill in top right */}
                    {activityPill && (
                      <div
                        className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-['Inter:SemiBold',sans-serif] font-semibold"
                        style={{ backgroundColor: activityPill.bgColor, color: activityPill.color }}
                        title={activityPill.tooltip}
                      >
                        {activityPill.text}
                      </div>
                    )}
                    <div className="flex flex-col gap-2 mb-3">
                      <h3 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] line-clamp-2 pr-12">
                        {mountain.name}
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-1 rounded-full ${mountain.proposalCreated ? 'bg-[#eaf5ef] text-[#3f7a5c]' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>
                          {mountain.proposalCreated ? 'Customer' : 'Prospect'}
                        </span>
                        {mountain.trailMapType && (
                          <button
                            onClick={e => openMap(e, mountain.id, mountain.name)}
                            className="flex items-center gap-1 bg-[#f0fdf4] text-[#22c55e] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-1 rounded-full active:bg-[#dcfce7] transition-colors"
                            title={formatTimestamp(mountain.trailMapUploadedAt)}
                          >
                            <Map size={9} />
                            Map
                          </button>
                        )}
                        {mountain.proposalCreated && (
                          <button
                            onClick={e => openProposal(e, mountain.id)}
                            className="flex items-center gap-1 bg-[#fff3f0] text-[#ff5c39] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-1 rounded-full active:bg-[#ffe0d9] transition-colors"
                            title={formatTimestamp(mountain.proposalCreatedAt)}
                          >
                            <FileText size={9} />
                            Proposal
                          </button>
                        )}
                        {mountain.invoice && (
                          <button
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(`/mountains/${mountain.id}/invoice`);
                            }}
                            className="flex items-center gap-1 bg-[#fef3c7] text-[#d97706] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-1 rounded-full active:bg-[#fde68a] transition-colors"
                            title={`Invoice created ${mountain.invoice.date}`}
                          >
                            <Receipt size={9} />
                            Invoice
                          </button>
                        )}
                        <button
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setNotesModalMountainId(mountain.id);
                          }}
                          className="flex items-center gap-1 bg-[#EBF3FF] text-[#307FE2] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-1 rounded-full active:bg-[#C5DEFF] transition-colors"
                          title={formatTimestamp(mostRecentNoteUpdate)}
                        >
                          <StickyNote size={9} />
                          {noteCount > 0 ? noteCount : 'Notes'}
                        </button>
                      </div>
                    </div>
                    <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1 line-clamp-2">
                      {mountain.address}
                    </p>
                    <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-2">
                      {mountain.phone}
                    </p>
                    {(trailCount > 0 || installedCameras > 0) && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {trailCount > 0 && (
                          <span className="flex items-center gap-1 bg-[#f3f3f5] text-[#6a7282] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                            <MapPin size={10} />
                            {trailCount} trail{trailCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {installedCameras > 0 && (
                          <span className="flex items-center gap-1 bg-[#fff3f0] text-[#ff5c39] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                            <Camera size={10} />
                            {installedCameras}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Sales Process Bar */}
                    <div className="mt-auto">
                      <SalesProcessBar
                        notes={getNotesByMountainId(mountain.id)}
                        onStageClick={(topic) => {
                          navigate(`/mountains/${mountain.id}`, { state: { scrollToTopic: topic } });
                        }}
                      />
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
