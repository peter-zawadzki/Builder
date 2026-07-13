import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Contact } from '../context/DataContext';
import { ArrowLeft, Plus, X, MapPin, Check } from 'lucide-react';
import { LogoUploader } from './LogoUploader';
import { toast } from 'sonner';
import { formatPhone } from '../utils/formatPhone';
import { ContactForm } from './ContactForm';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddableSelect } from './AddableSelect';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

const DEFAULT_PARENT_ORGS = ['Altera Mountain Co', 'Boyne Resorts', 'Powder Corporation', 'Vail Resorts'];

const emptyContact = (): Contact => ({
  name: '', title: '', email: '', phone: '', phoneType: 'Office', role: undefined, teamName: '', notes: '',
});

export function CreateMountain() {
  const navigate = useNavigate();
  const { addMountain, addTrail, organizations, contacts } = useData();
  const mountainGroups = organizations.filter(o => o.type === 'Mountain Group').sort((a, b) => a.name.localeCompare(b.name));
  const yullrOrg = organizations.find(o => o.name.trim().toLowerCase() === 'yullr');
  const ambassadors = yullrOrg ? contacts.filter(c => c.organizationId === yullrOrg.id).sort((a, b) => a.name.localeCompare(b.name)) : [];

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    billingAddress: '',
    parentOrganization: '',
    organizationId: '',
    affiliateContactIds: [] as string[],
    trailMapUrl: '',
    legalEntity: '',
    phone: '',
    website: '',
    notes: '',
    trailCount: '',
    acreage: '',
    verticalDrop: '',
    region: '',
    annualSkierVisits: '',
    terrainParks: '',
    highSchoolPrograms: '',
    middleSchoolPrograms: '',
    collegePrograms: '',
    adultLeagueParticipants: '',
    totalWeeklyJuniorAthletes: '',
    nastar: false,
    additionalContacts: [] as Contact[],
    mountainLogo: undefined as string | undefined,
  });

  const [billingSameAsMain, setBillingSameAsMain] = useState(false);
  const [timingSystems, setTimingSystems] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const TIMING_OPTIONS = ['Live Timing', 'VOLA', 'Brower', 'Other'];
  const toggleTiming = (opt: string) => {
    setTimingSystems(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]);
    setHasUnsavedChanges(true);
  };

  // Inline trail creation
  const [trailNames, setTrailNames] = useState<string[]>([]);
  const [newTrailInput, setNewTrailInput] = useState('');

  const addInlineTrail = () => {
    const name = newTrailInput.trim();
    if (!name) return;
    if (trailNames.includes(name)) { toast.error('Trail already added'); return; }
    setTrailNames(prev => [...prev, name]);
    setNewTrailInput('');
    setHasUnsavedChanges(true);
  };

  const removeInlineTrail = (name: string) => {
    setTrailNames(prev => prev.filter(t => t !== name));
    setHasUnsavedChanges(true);
  };

  // Track changes to form data
  useEffect(() => {
    const hasData = formData.name.trim() !== '' ||
                    formData.address.trim() !== '' ||
                    formData.phone.trim() !== '' ||
                    formData.website.trim() !== '' ||
                    formData.notes.trim() !== '' ||
                    formData.parentOrganization.trim() !== '' ||
                    formData.legalEntity.trim() !== '' ||
                    formData.billingAddress.trim() !== '' ||
                    formData.trailCount.trim() !== '' ||
                    formData.acreage.trim() !== '' ||
                    formData.verticalDrop.trim() !== '' ||
                    formData.region.trim() !== '' ||
                    formData.annualSkierVisits.trim() !== '' ||
                    formData.terrainParks.trim() !== '' ||
                    formData.highSchoolPrograms.trim() !== '' ||
                    formData.middleSchoolPrograms.trim() !== '' ||
                    formData.collegePrograms.trim() !== '' ||
                    formData.adultLeagueParticipants.trim() !== '' ||
                    formData.totalWeeklyJuniorAthletes.trim() !== '' ||
                    formData.nastar ||
                    formData.additionalContacts.length > 0 ||
                    trailNames.length > 0 ||
                    timingSystems.length > 0;
    setHasUnsavedChanges(hasData);
  }, [formData, trailNames, timingSystems]);

  const allContacts = [...formData.additionalContacts];
  const knownTeamNames = [...new Set(
    allContacts.map(c => c.teamName).filter((t): t is string => !!t && t !== '__new__' && t.trim() !== '')
  )];

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
    setFormData(prev => ({ ...prev, additionalContacts: [...prev.additionalContacts, emptyContact()] }));
  };

  const updateContact = (index: number, field: keyof Contact, value: string) => {
    const updated = [...formData.additionalContacts];
    updated[index] = { ...updated[index], [field]: value };
    setFormData(prev => ({ ...prev, additionalContacts: updated }));
  };

  const removeContact = (index: number) => {
    setFormData(prev => ({ ...prev, additionalContacts: prev.additionalContacts.filter((_, i) => i !== index) }));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim() || !formData.region.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    const newId = addMountain({
      ...formData,
      billingAddress: billingSameAsMain ? formData.address : formData.billingAddress,
      email: '',
      timingSystems: timingSystems.length > 0 ? timingSystems : undefined,
      adminContact: emptyContact(),
      technicalContact: emptyContact(),
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
    // Save any inline-added trails
    trailNames.forEach(name => addTrail({ mountainId: newId, name }));
    toast.success('Mountain added successfully!');
    setHasUnsavedChanges(false);
    markSaved();
    navigate('/');
  };

  // Unsaved changes protection
  const { showPrompt, handleSave, handleDiscard, handleCancel, markSaved } = useUnsavedChanges({
    when: hasUnsavedChanges,
    message: 'You have unsaved changes. Do you want to save this mountain before leaving?',
    onSave: handleSubmit,
  });

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">Add Mountain</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6 pb-20">

        {/* Basic Info */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Basic Information</h2>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Mountain Name *</label>
            <input type="text" required value={formData.name} onChange={e => updateField('name', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="e.g., Whistler Mountain" autoFocus />
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

        {/* Organization & Billing */}
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

        {/* ── Trails (optional) ── */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
          <div>
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Trails</h2>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mt-0.5">
              Optional — add known trails now or later. Trails carry into the proposal.
            </p>
          </div>

          {trailNames.length > 0 && (
            <div className="space-y-2">
              {trailNames.map(name => (
                <div key={name} className="flex items-center gap-3 bg-[#f9fafb] border border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2.5">
                  <MapPin size={14} className="text-[#ff5c39] flex-shrink-0" />
                  <span className="flex-1 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">{name}</span>
                  <button
                    type="button"
                    onClick={() => removeInlineTrail(name)}
                    className="p-1 rounded active:opacity-60"
                  >
                    <X size={14} className="text-[#6a7282]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTrailInput}
              onChange={e => setNewTrailInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInlineTrail(); } }}
              placeholder="Trail name, e.g. Upper Meadow"
              className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] outline-none"
            />
            <button
              type="button"
              onClick={addInlineTrail}
              disabled={!newTrailInput.trim()}
              className="bg-[#1D2930] text-white rounded-[8px] px-4 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px] flex items-center gap-1.5 active:opacity-80 disabled:opacity-40"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>

        {/* Contacts are added from the CRM and linked to the mountain. */}

        <button type="submit"
          className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
          Add Mountain
        </button>
      </form>

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        isOpen={showPrompt}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onCancel={handleCancel}
        showSaveButton={formData.name.trim() !== '' && formData.address.trim() !== ''}
      />
    </div>
  );
}