import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Contact, TechAdmin, Annotation } from '../context/DataContext';
import { Plus, X, Archive, Trash2, Upload, ZoomIn, ExternalLink, ImageIcon, Edit3, Check } from 'lucide-react';
import { LogoUploader } from './LogoUploader';
import { toast } from 'sonner';
import { formatPhone } from '../utils/formatPhone';
import { ContactForm } from './ContactForm';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddableSelect } from './AddableSelect';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { ImageAnnotator } from './ImageAnnotator';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const AUTH_HEADER = { Authorization: `Bearer ${publicAnonKey}` };

const DEFAULT_PARENT_ORGS = ['Altera Mountain Co', 'Boyne Resorts', 'Powder Corporation', 'Vail Resorts'];

const emptyContact = (): Contact => ({
  name: '', title: '', email: '', phone: '', phoneType: 'Office', role: undefined, teamName: '', notes: '',
});

// ── Compress image before upload ─────────────────────────────────────────────
async function compressImage(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.onload = () => {
        const MAX = 2400;
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX || h > MAX) {
          const r = Math.min(MAX / w, MAX / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}

export function EditMountain() {
  const { mountainId } = useParams();
  const navigate = useNavigate();
  const {
    getMountainById,
    updateMountain,
    organizations,
    contacts,
    getTrailsByMountainId,
    addTrail,
    deleteTrail,
  } = useData();

  const mountain = getMountainById(mountainId!);
  const mountainGroups = organizations.filter(o => o.type === 'Mountain Group').sort((a, b) => a.name.localeCompare(b.name));
  const yullrOrg = organizations.find(o => o.name.trim().toLowerCase() === 'yullr');
  const ambassadors = yullrOrg ? contacts.filter(c => c.organizationId === yullrOrg.id).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const mountainTrails = getTrailsByMountainId(mountainId!);
  const [newTrail, setNewTrail] = useState('');
  const addTrailNow = () => {
    const name = newTrail.trim();
    if (!name) return;
    addTrail({ mountainId: mountainId!, name });
    setNewTrail('');
  };
  const [trailToDelete, setTrailToDelete] = useState<{ id: string; name: string } | null>(null);

  const [formData, setFormData] = useState({
    name: mountain?.name || '',
    address: mountain?.address || '',
    billingAddress: mountain?.billingAddress || '',
    parentOrganization: mountain?.parentOrganization || '',
    organizationId: mountain?.organizationId || '',
    affiliateContactIds: mountain?.affiliateContactIds || [] as string[],
    trailMapUrl: mountain?.trailMapUrl || '',
    legalEntity: mountain?.legalEntity || '',
    phone: mountain?.phone || '',
    website: mountain?.website || '',
    notes: mountain?.notes || '',
    trailCount: mountain?.trailCount?.toString() || '',
    acreage: mountain?.acreage?.toString() || '',
    verticalDrop: mountain?.verticalDrop?.toString() || '',
    region: mountain?.region || '',
    annualSkierVisits: mountain?.annualSkierVisits?.toString() || '',
    terrainParks: mountain?.terrainParks?.toString() || '',
    highSchoolPrograms: mountain?.highSchoolPrograms?.toString() || '',
    middleSchoolPrograms: mountain?.middleSchoolPrograms?.toString() || '',
    collegePrograms: mountain?.collegePrograms?.toString() || '',
    adultLeagueParticipants: mountain?.adultLeagueParticipants?.toString() || '',
    totalWeeklyJuniorAthletes: mountain?.totalWeeklyJuniorAthletes?.toString() || '',
    nastar: mountain?.nastar || false,
    mountainLogo: mountain?.mountainLogo || undefined as string | undefined,
    adminContact: { ...emptyContact(), ...(mountain?.adminContact || {}) } as Contact,
    technicalContact: { ...emptyContact(), ...(mountain?.technicalContact || {}) } as Contact,
    additionalContacts: (mountain?.additionalContacts || []).map(c => ({ ...emptyContact(), ...c })) as Contact[],
  });

  const [techAdmins, setTechAdmins] = useState<TechAdmin[]>(
    mountain?.technicalAdministrators?.map(a => ({ ...a })) || []
  );

  const [timingSystems, setTimingSystems] = useState<string[]>(mountain?.timingSystems || []);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const TIMING_OPTIONS = ['Live Timing', 'VOLA', 'Brower', 'Other'];
  const toggleTiming = (opt: string) =>
    setTimingSystems(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]);
  const [billingSameAsMain, setBillingSameAsMain] = useState(
    !!mountain?.billingAddress && mountain.billingAddress === mountain.address
  );

  // ── Trail map state ──────────────────────────────────────────────────────
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [mapMime, setMapMime] = useState<string | null>(null);
  const [mapFileName, setMapFileName] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(!!mountain?.trailMapType);
  const [mapUploading, setMapUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showAnnotator, setShowAnnotator] = useState(false);
  const [showDeleteMapModal, setShowDeleteMapModal] = useState(false);
  const mapFileRef = useRef<HTMLInputElement>(null);

  // Load existing trail map URL from server on mount
  useEffect(() => {
    if (!mountainId || !mountain?.trailMapType) { setMapLoading(false); return; }
    fetch(`${API_BASE}/trail-map/${mountainId}`, { headers: AUTH_HEADER })
      .then(r => r.json())
      .then((data: any) => {
        if (data.url) { setMapUrl(data.url); setMapMime(data.mimeType); setMapFileName(data.fileName); }
      })
      .catch(err => console.error('Failed to load trail map URL:', err))
      .finally(() => setMapLoading(false));
  }, [mountainId]);

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !mountainId) return;
    setMapUploading(true);
    e.target.value = '';
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onload = ev => res(ev.target!.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const finalDataUrl = file.type.startsWith('image/') ? await compressImage(dataUrl) : dataUrl;
      const resp = await fetch(`${API_BASE}/trail-map/upload`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountainId, dataUrl: finalDataUrl, mimeType: file.type, fileName: file.name }),
      });
      const data = await resp.json() as any;
      if (!resp.ok || data.error) throw new Error(data.error || 'Upload failed');
      const mapType: 'image' | 'pdf' = file.type === 'application/pdf' ? 'pdf' : 'image';
      updateMountain(mountainId, {
        trailMapType: mapType,
        trailMapUploadedAt: new Date().toISOString()
      });
      setMapUrl(data.url);
      setMapMime(file.type);
      setMapFileName(file.name);
      toast.success('Trail map uploaded');
    } catch (err) {
      console.error('Trail map upload error:', err);
      toast.error('Upload failed — please try again');
    } finally {
      setMapUploading(false);
    }
  };

  const handleDeleteMap = async () => {
    if (!mountainId) return;
    setShowDeleteMapModal(false);
    try {
      await fetch(`${API_BASE}/trail-map/${mountainId}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      updateMountain(mountainId, {
        trailMapType: undefined,
        trailMapUploadedAt: undefined
      });
      setMapUrl(null); setMapMime(null); setMapFileName(null);
      toast.success('Trail map removed');
    } catch (err) {
      console.error('Trail map delete error:', err);
      toast.error('Could not remove trail map');
    }
  };

  const isMapImage = mapMime?.startsWith('image/');
  const isMapPdf = mapMime === 'application/pdf';

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

  // Collect team name suggestions from all contacts
  const allContacts = [...formData.additionalContacts];
  const knownTeamNames = [...new Set(
    allContacts.map(c => c.teamName).filter((t): t is string => !!t && t !== '__new__' && t.trim() !== '')
  )];

  // Track form changes
  // Dirty tracking via a one-time baseline snapshot — avoids false positives
  // from undefined-vs-'' field mismatches on load.
  const initialSnapshot = useRef<string | null>(null);
  useEffect(() => {
    if (!mountain) return;
    const current = JSON.stringify({ formData, timingSystems, techAdmins });
    if (initialSnapshot.current === null) {
      initialSnapshot.current = current; // capture baseline once, not dirty yet
      return;
    }
    setHasUnsavedChanges(current !== initialSnapshot.current);
  }, [formData, timingSystems, techAdmins, mountain]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateMountain(mountainId!, {
      ...formData,
      billingAddress: billingSameAsMain ? formData.address : formData.billingAddress,
      email: mountain!.email || '',
      timingSystems: timingSystems.length > 0 ? timingSystems : undefined,
      technicalAdministrators: techAdmins,
      trailCount: formData.trailCount ? parseInt(formData.trailCount) : undefined,
      acreage: formData.acreage ? parseInt(formData.acreage) : undefined,
      verticalDrop: formData.verticalDrop ? parseInt(formData.verticalDrop) : undefined,
      annualSkierVisits: formData.annualSkierVisits ? parseInt(formData.annualSkierVisits) : undefined,
      terrainParks: formData.terrainParks ? parseInt(formData.terrainParks) : undefined,
      highSchoolPrograms: formData.highSchoolPrograms ? parseInt(formData.highSchoolPrograms) : undefined,
      middleSchoolPrograms: formData.middleSchoolPrograms ? parseInt(formData.middleSchoolPrograms) : undefined,
      collegePrograms: formData.collegePrograms ? parseInt(formData.collegePrograms) : undefined,
      adultLeagueParticipants: formData.adultLeagueParticipants ? parseInt(formData.adultLeagueParticipants) : undefined,
      totalWeeklyJuniorAthletes: formData.totalWeeklyJuniorAthletes ? parseInt(formData.totalWeeklyJuniorAthletes) : undefined,
      trailMapUrl: formData.trailMapUrl.trim() || undefined,
      affiliateContactIds: formData.affiliateContactIds.length > 0 ? formData.affiliateContactIds : undefined,
      region: formData.region || undefined,
    });
    toast.success('Mountain updated successfully!');
    setHasUnsavedChanges(false);
    markSaved();
    navigate(`/mountains/${mountainId}`);
  };

  // Unsaved changes protection
  const { showPrompt, handleSave, handleDiscard, handleCancel, markSaved } = useUnsavedChanges({
    when: hasUnsavedChanges,
    message: 'You have unsaved changes to this mountain. Do you want to save before leaving?',
    onSave: handleSubmit,
  });

  // No hard deletes — mountains are soft-archived (recoverable from the
  // Mountains list' Archived toggle) instead.
  const handleArchive = () => {
    updateMountain(mountainId!, { archived: true });
    toast.success(`${mountain.name} archived`);
    setHasUnsavedChanges(false);
    markSaved();
    navigate('/');
  };

  const handleClose = () => {
    navigate(`/mountains/${mountainId}`);
  };

  const updateField = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const toggleAffiliate = (id: string) => {
    setFormData(prev => ({
      ...prev,
      affiliateContactIds: prev.affiliateContactIds.includes(id)
        ? prev.affiliateContactIds.filter(x => x !== id)
        : [...prev.affiliateContactIds, id],
    }));
  };

  const addContact = () => {
    setFormData({ ...formData, additionalContacts: [...formData.additionalContacts, emptyContact()] });
  };

  const removeContact = (index: number) => {
    setFormData({ ...formData, additionalContacts: formData.additionalContacts.filter((_, i) => i !== index) });
  };

  const updateContact = (index: number, field: keyof Contact, value: string) => {
    const updated = [...formData.additionalContacts];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, additionalContacts: updated });
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] flex-1">
            Mountain Info
          </h1>
          <button onClick={() => handleSubmit()} className="px-3 py-1.5 rounded-full bg-[#1D2930] text-white text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
            Apply
          </button>
          <button onClick={handleClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-6 pb-20">

        {/* Basic Information */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Basic Information</h2>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Mountain Name *</label>
            <input type="text" required value={formData.name} onChange={e => updateField('name', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="e.g., Whistler Mountain" />
          </div>

          <LogoUploader value={formData.mountainLogo} onChange={v => setFormData(prev => ({ ...prev, mountainLogo: v }))} />

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Address *</label>
            <AddressAutocomplete
              value={formData.address}
              onChange={v => updateField('address', v)}
              placeholder="Search resort name or enter address"
            />
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Phone</label>
            <input type="tel" value={formData.phone} onChange={e => updateField('phone', formatPhone(e.target.value))}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="(555)123-4567" />
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Website</label>
            <input type="url" value={formData.website} onChange={e => updateField('website', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="https://mountain.com" />
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Timing Systems</label>
            <div className="flex flex-wrap gap-3">
              {TIMING_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleTiming(opt)}
                  className="flex items-center gap-2 active:opacity-70"
                >
                  <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center flex-shrink-0 transition-colors ${timingSystems.includes(opt) ? 'bg-[#ff5c39] border-[#ff5c39]' : 'bg-white border-[#d1d5db]'}`}>
                    {timingSystems.includes(opt) && (
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">{opt}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Notes</label>
            <textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] min-h-[80px]"
              placeholder="Additional notes about this mountain..." />
          </div>

          {/* ── Trail Map ── */}
          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Trail Map</label>

            {mapLoading ? (
              <div className="h-24 bg-[#f3f3f5] rounded-[8px] flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#ff5c39] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mapUrl ? (
              <div className="border border-[rgba(0,0,0,0.1)] rounded-[10px] overflow-hidden">
                {isMapImage ? (
                  <div className="relative">
                    <img src={mapUrl} alt="Trail Map" className="w-full object-contain max-h-52 bg-[#f3f3f5]" />
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 active:bg-black/70"
                    >
                      <ZoomIn size={15} />
                    </button>
                  </div>
                ) : isMapPdf ? (
                  <div className="flex items-center gap-3 px-4 py-4 bg-[#f9fafb]">
                    <div className="w-10 h-10 bg-[#fff3f0] rounded-[8px] flex items-center justify-center flex-shrink-0">
                      <ExternalLink size={18} className="text-[#ff5c39]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px] truncate">{mapFileName}</p>
                      <p className="text-[#6a7282] text-[12px]">PDF</p>
                    </div>
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[#307fe2] text-[12px] font-['Inter:Medium',sans-serif] px-2 py-1 bg-[#eef3fb] rounded-[6px]">
                      Open
                    </a>
                  </div>
                ) : null}
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-[rgba(0,0,0,0.06)] bg-white">
                  <div className="flex items-center gap-2 flex-1">
                    <p className="text-[#6a7282] text-[12px] truncate flex-1">{mapFileName}</p>
                    {mountain?.trailMapAnnotations && mountain.trailMapAnnotations.length > 0 && (
                      <span className="bg-[#fff5f3] text-[#ff5c39] text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                        {mountain.trailMapAnnotations.length} annotation{mountain.trailMapAnnotations.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isMapImage && (
                      <button type="button" onClick={() => setShowAnnotator(true)}
                        className="flex items-center gap-1 text-[#ff5c39] text-[12px] font-['Inter:Medium',sans-serif] bg-[#fff5f3] px-2.5 py-1.5 rounded-[6px] active:bg-[#ffe8e3]">
                        <Edit3 size={12} /> Annotate
                      </button>
                    )}
                    <button type="button" onClick={() => mapFileRef.current?.click()}
                      className="flex items-center gap-1 text-[#307fe2] text-[12px] font-['Inter:Medium',sans-serif] bg-[#eef3fb] px-2.5 py-1.5 rounded-[6px] active:bg-[#dce8f4]">
                      <Upload size={12} /> Replace
                    </button>
                    <button type="button" onClick={() => setShowDeleteMapModal(true)}
                      className="p-1.5 bg-[#fff0ee] rounded-[6px] active:bg-[#ffe0da]">
                      <Trash2 size={14} className="text-[#ff5c39]" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => mapFileRef.current?.click()}
                disabled={mapUploading}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[rgba(0,0,0,0.12)] rounded-[10px] py-7 text-[#6a7282] active:border-[#ff5c39] active:text-[#ff5c39] transition-colors bg-[#f9fafb] disabled:opacity-60"
              >
                {mapUploading ? (
                  <div className="w-6 h-6 border-2 border-[#ff5c39] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ImageIcon size={26} className="text-[#d1d5db]" />
                    <span className="font-['Inter:Medium',sans-serif] text-[14px]">Upload Trail Map</span>
                    <span className="font-['Inter:Regular',sans-serif] text-[12px] text-[#9ca3af]">Image or PDF</span>
                  </>
                )}
              </button>
            )}
            {mapUploading && mapUrl === null && (
              <p className="text-[#6a7282] text-[12px] mt-1.5 text-center">Uploading…</p>
            )}
            <input
              ref={mapFileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleMapUpload}
            />
          </div>

          {/* ── Mountain Stats ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Trails</label>
              <input
                type="number"
                min="0"
                value={formData.trailCount}
                onChange={e => updateField('trailCount', e.target.value)}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
                placeholder="e.g., 150"
              />
            </div>
            <div>
              <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Acreage</label>
              <input
                type="number"
                min="0"
                value={formData.acreage}
                onChange={e => updateField('acreage', e.target.value)}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
                placeholder="e.g., 5280"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Vertical (ft)</label>
              <input
                type="number"
                min="0"
                value={formData.verticalDrop}
                onChange={e => updateField('verticalDrop', e.target.value)}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
                placeholder="e.g., 3000"
              />
            </div>
            <div>
              <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Region *</label>
              <select
                value={formData.region}
                onChange={e => updateField('region', e.target.value)}
                required
                className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              >
                <option value="">Select region</option>
                <option value="Rocky Mountains">Rocky Mountains</option>
                <option value="Sierra Nevada">Sierra Nevada</option>
                <option value="Pacific Northwest">Pacific Northwest</option>
                <option value="Northeast">Northeast</option>
                <option value="Mid-Atlantic">Mid-Atlantic</option>
                <option value="Midwest">Midwest</option>
                <option value="Europe">Europe</option>
                <option value="Canada">Canada</option>
              </select>
            </div>
          </div>

        </div>

        {/* Programs & Participation */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Programs &amp; Participation</h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['annualSkierVisits', 'Annual Skier Visits'],
              ['terrainParks', 'Terrain Parks'],
              ['highSchoolPrograms', 'High School Programs'],
              ['middleSchoolPrograms', 'Middle School Programs'],
              ['collegePrograms', 'College Programs'],
              ['adultLeagueParticipants', 'Adult League Participants'],
              ['totalWeeklyJuniorAthletes', 'Total Weekly Junior Athletes'],
            ] as const).map(([field, label]) => (
              <div key={field}>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">{label}</label>
                <input
                  type="number"
                  min="0"
                  value={formData[field]}
                  onChange={e => updateField(field, e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, nastar: !prev.nastar }))}
            className="flex items-center gap-2 active:opacity-70"
          >
            <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center flex-shrink-0 transition-colors ${formData.nastar ? 'bg-[#ff5c39] border-[#ff5c39]' : 'bg-white border-[#d1d5db]'}`}>
              {formData.nastar && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">NASTAR</span>
          </button>
        </div>

        {/* Trails */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
            Trails{mountainTrails.length > 0 && <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({mountainTrails.length})</span>}
          </h2>
          {mountainTrails.map(t => (
            <div key={t.id} className="flex items-center justify-between border border-[rgba(0,0,0,0.1)] rounded-[8px] px-3 py-2.5">
              <span className="text-[14px] text-[#0a0a0a]">{t.name}</span>
              <button type="button" onClick={() => setTrailToDelete({ id: t.id, name: t.name })} className="p-1.5 rounded-[6px] bg-[#fff0ee] active:bg-[#ffe0da]"><X size={14} className="text-[#ff5c39]" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newTrail}
              onChange={e => setNewTrail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTrailNow(); } }}
              placeholder="Add a trail (e.g. Eggbeater)"
              className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] outline-none"
            />
            <button type="button" onClick={addTrailNow} className="shrink-0 flex items-center gap-1 bg-[#1D2930] text-white px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif]">
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {/* Organization */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Organization</h2>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Parent Organization</label>
            <select
              value={formData.organizationId}
              onChange={e => {
                const org = mountainGroups.find(o => o.id === e.target.value);
                setFormData(prev => ({ ...prev, organizationId: org?.id || '', parentOrganization: org?.name || '' }));
              }}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px]"
            >
              <option value="">— None —</option>
              {mountainGroups.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {formData.parentOrganization && !formData.organizationId && (
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mt-1">
                Currently “{formData.parentOrganization}” (not yet linked to a Mountain Group). Pick one above to link it.
              </p>
            )}
            {mountainGroups.length === 0 && (
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mt-1">
                No Mountain Group organizations yet — create one in the CRM (Organizations → type “Mountain Group”).
              </p>
            )}
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Affiliates</label>
            <div className="border border-[rgba(0,0,0,0.08)] rounded-[8px] max-h-40 overflow-y-auto divide-y divide-[rgba(0,0,0,0.05)]">
              {ambassadors.map(c => (
                <button key={c.id} type="button" onClick={() => toggleAffiliate(c.id)} className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-[14px] ${formData.affiliateContactIds.includes(c.id) ? 'bg-[#f0fdf4] text-[#1b5e20]' : 'text-[#0a0a0a]'}`}>
                  {formData.affiliateContactIds.includes(c.id) && <Check size={14} className="text-[#2e7d32]" />}
                  {c.name}
                </button>
              ))}
            </div>
            {ambassadors.length === 0 && (
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mt-1">
                Add people to the YULLR organization in the CRM to assign affiliates.
              </p>
            )}
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Trail Map URL</label>
            <input
              type="url"
              value={formData.trailMapUrl}
              onChange={e => updateField('trailMapUrl', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="https://…"
            />
          </div>

        </div>

        {/* Contacts are managed from the CRM, not here. Existing contact data
            is preserved on save. */}

        {/* Archive Mountain — no hard delete; recoverable from the Mountains
            list' Archived toggle. */}
        <button
          type="button"
          onClick={handleArchive}
          className="w-full flex items-center justify-center gap-2 bg-white border border-[rgba(255,92,57,0.3)] text-[#ff5c39] rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:bg-[#fff0ee]"
        >
          <Archive size={18} />
          Archive Mountain
        </button>

      </form>

      {/* Image lightbox */}
      {lightboxOpen && mapUrl && isMapImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center active:bg-white/30"
            onClick={() => setLightboxOpen(false)}
          >
            <X size={20} className="text-white" />
          </button>
          <img
            src={mapUrl}
            alt="Trail Map"
            className="max-w-full max-h-full object-contain p-4"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Annotator */}
      {showAnnotator && mapUrl && isMapImage && (
        <ImageAnnotator
          imageUrl={mapUrl}
          existingAnnotations={mountain?.trailMapAnnotations || []}
          onSave={(annotations: Annotation[]) => {
            updateMountain(mountainId, { trailMapAnnotations: annotations });
            setShowAnnotator(false);
          }}
          onClose={() => setShowAnnotator(false)}
          title={`Annotate Trail Map - ${mountain?.name}`}
        />
      )}

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        isOpen={showPrompt}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onCancel={handleCancel}
      />

      {/* Delete trail confirmation */}
      {trailToDelete && (
        <DeleteConfirmModal
          title={`Delete "${trailToDelete.name}"?`}
          description="This will permanently delete this trail. This cannot be undone."
          onConfirm={() => { deleteTrail(trailToDelete.id); setTrailToDelete(null); }}
          onCancel={() => setTrailToDelete(null)}
        />
      )}

      {/* Delete trail map confirmation */}
      {showDeleteMapModal && (
        <DeleteConfirmModal
          title="Delete trail map?"
          description={
            <>
              This will permanently delete the trail map{' '}
              {mapFileName && (
                <>
                  (
                  <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                    {mapFileName}
                  </span>
                  )
                </>
              )}
              {mountain?.trailMapAnnotations && mountain.trailMapAnnotations.length > 0 && (
                <>, including {mountain.trailMapAnnotations.length} annotation{mountain.trailMapAnnotations.length !== 1 ? 's' : ''}</>
              )}
              . This cannot be undone.
            </>
          }
          onConfirm={handleDeleteMap}
          onCancel={() => setShowDeleteMapModal(false)}
        />
      )}
    </div>
  );
}