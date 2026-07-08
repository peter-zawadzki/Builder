import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Contact } from '../context/DataContext';
import { ArrowLeft, Plus, X, FileText, MapPin } from 'lucide-react';
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
  const { addMountain, addTrail } = useData();

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    billingAddress: '',
    parentOrganization: '',
    legalEntity: '',
    phone: '',
    website: '',
    notes: '',
    trailCount: '',
    acreage: '',
    verticalDrop: '',
    slackEmail: '',
    region: '',
    additionalContacts: [] as Contact[],
  });

  const [billingSameAsMain, setBillingSameAsMain] = useState(false);
  const [savedMountainId, setSavedMountainId] = useState<string | null>(null);
  const [timingSystems, setTimingSystems] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const TIMING_OPTIONS = ['Live Timing', 'VOLA', 'Other'];
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
                    formData.slackEmail.trim() !== '' ||
                    formData.region.trim() !== '' ||
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
      slackEmail: formData.slackEmail || undefined,
      region: formData.region || undefined,
    });
    // Save any inline-added trails
    trailNames.forEach(name => addTrail({ mountainId: newId, name }));
    toast.success('Mountain added successfully!');
    setHasUnsavedChanges(false);
    setSavedMountainId(newId);
  };

  // Unsaved changes protection
  const { showPrompt, handleSave, handleDiscard, handleCancel } = useUnsavedChanges({
    when: hasUnsavedChanges && !savedMountainId,
    message: 'You have unsaved changes. Do you want to save this mountain before leaving?',
    onSave: handleSubmit,
  });

  // ── Success / Proposal prompt ──
  if (savedMountainId) {
    return (
      <div className="min-h-screen bg-[#F2F3F5] flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.1)] p-6 w-full max-w-sm text-center shadow-sm">
          <div className="w-14 h-14 bg-[#fff3f0] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17L4 12" stroke="#ff5c39" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-semibold text-[18px] mb-1">
            {formData.name} added!
          </h2>
          {trailNames.length > 0 && (
            <p className="text-[#22c55e] font-['Inter:Regular',sans-serif] text-[13px] mb-2">
              {trailNames.length} trail{trailNames.length !== 1 ? 's' : ''} saved
            </p>
          )}
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] mb-6">
            Would you like to build a proposal for this mountain?
          </p>
          <button
            onClick={() => navigate(`/mountains/${savedMountainId}/proposal`)}
            className="w-full bg-[#ff5c39] text-white rounded-[10px] px-4 py-3.5 font-['Inter:Medium',sans-serif] font-semibold text-[15px] active:opacity-80 flex items-center justify-center gap-2 mb-3"
          >
            <FileText size={18} />
            Build Proposal
          </button>
          <button
            onClick={() => navigate(`/mountains/${savedMountainId}`)}
            className="w-full bg-[#f3f3f5] text-[#0a0a0a] rounded-[10px] px-4 py-3.5 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:opacity-70"
          >
            View Mountain
          </button>
          <button
            onClick={() => navigate('/')}
            className="mt-3 text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] active:opacity-60"
          >
            Back to mountains list
          </button>
        </div>
      </div>
    );
  }

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
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Slack Email</label>
            <input
              type="email"
              value={formData.slackEmail}
              onChange={e => updateField('slackEmail', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="team@slack.com"
            />
          </div>
        </div>

        {/* Organization & Billing */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Organization & Billing</h2>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Parent Organization</label>
            <AddableSelect
              optionKey="mountain:parentOrganizations"
              value={formData.parentOrganization}
              onChange={v => updateField('parentOrganization', v)}
              placeholder="Select organization"
              defaultOptions={DEFAULT_PARENT_ORGS}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px]"
            />
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Legal Entity</label>
            <input
              type="text"
              value={formData.legalEntity}
              onChange={e => updateField('legalEntity', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="e.g., Whistler Mountain Resort Ltd."
            />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mt-1">
              Full legal name used for contracts and agreements
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">Billing Address</label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative ${billingSameAsMain ? 'bg-[#307fe2]' : 'bg-[#d1d5db]'}`}
                  onClick={() => setBillingSameAsMain(v => !v)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${billingSameAsMain ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">Same as address</span>
              </label>
            </div>
            {!billingSameAsMain && (
              <AddressAutocomplete
                value={formData.billingAddress}
                onChange={v => updateField('billingAddress', v)}
                placeholder="Search or enter billing address"
              />
            )}
            {billingSameAsMain && (
              <div className="bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">
                {formData.address || 'Same as mountain address'}
              </div>
            )}
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