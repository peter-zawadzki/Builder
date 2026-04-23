import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Contact } from '../context/DataContext';
import { ArrowLeft, Plus, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatPhone } from '../utils/formatPhone';
import { ContactForm } from './ContactForm';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddableSelect } from './AddableSelect';

const DEFAULT_PARENT_ORGS = ['Altera Mountain Co', 'Boyne Resorts', 'Powder Corporation', 'Vail Resorts'];

const emptyContact = (): Contact => ({
  name: '', title: '', email: '', phone: '', phoneType: 'Office', role: undefined, teamName: '', notes: '',
});

export function EditMountain() {
  const { mountainId } = useParams();
  const navigate = useNavigate();
  const {
    getMountainById,
    updateMountain,
    deleteMountain,
    getLocationsByMountainId,
    getAssetsByLocationId,
  } = useData();

  const mountain = getMountainById(mountainId!);

  const [formData, setFormData] = useState({
    name: mountain?.name || '',
    address: mountain?.address || '',
    billingAddress: mountain?.billingAddress || '',
    parentOrganization: mountain?.parentOrganization || '',
    legalEntity: mountain?.legalEntity || '',
    phone: mountain?.phone || '',
    website: mountain?.website || '',
    notes: mountain?.notes || '',
    ipSubnet: mountain?.ipSubnet || '',
    adminContact: { ...emptyContact(), ...(mountain?.adminContact || {}) } as Contact,
    technicalContact: { ...emptyContact(), ...(mountain?.technicalContact || {}) } as Contact,
    additionalContacts: (mountain?.additionalContacts || []).map(c => ({ ...emptyContact(), ...c })) as Contact[],
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Toggle: billing address same as main address
  const [billingSameAsMain, setBillingSameAsMain] = useState(
    !!mountain?.billingAddress && mountain.billingAddress === mountain.address
  );

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

  const installLocations = getLocationsByMountainId(mountainId!);
  const siteInspections: any[] = [];
  const totalAssets = installLocations.reduce(
    (sum, loc) => sum + getAssetsByLocationId(loc.id).filter(a => a.type !== 'Miscellaneous').length,
    0
  );

  // Collect team name suggestions from all contacts
  const allContacts = [...formData.additionalContacts];
  const knownTeamNames = [...new Set(
    allContacts.map(c => c.teamName).filter((t): t is string => !!t && t !== '__new__' && t.trim() !== '')
  )];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMountain(mountainId!, {
      ...formData,
      billingAddress: billingSameAsMain ? formData.address : formData.billingAddress,
      email: mountain!.email || '',
    });
    toast.success('Mountain updated successfully!');
    navigate(`/mountains/${mountainId}`);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMountain(mountainId!);
      toast.success(`${mountain.name} deleted`);
      navigate('/');
    } catch {
      toast.error('Failed to delete mountain. Please try again.');
      setIsDeleting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
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
      {showDeleteModal && (
        <DeleteConfirmModal
          title={`Delete ${mountain.name}?`}
          description={
            <>
              This will permanently delete this mountain along with{' '}
              <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                {installLocations.length} install location{installLocations.length !== 1 ? 's' : ''}
              </span>
              ,{' '}
              <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                {totalAssets} asset{totalAssets !== 1 ? 's' : ''}
              </span>
              , and{' '}
              <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                {siteInspections.length} inspection location{siteInspections.length !== 1 ? 's' : ''}
              </span>
              , including all photos and videos. This cannot be undone.
            </>
          }
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/mountains/${mountainId}`)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] flex-1">
            Mountain Info
          </h1>
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
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">IP Subnet</label>
            <input type="text" value={formData.ipSubnet} onChange={e => updateField('ipSubnet', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
              placeholder="e.g. 192.168.1." />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mt-1">
              Default IP prefix for all assets at this mountain
            </p>
          </div>

          <div>
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Notes</label>
            <textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] min-h-[80px]"
              placeholder="Additional notes about this mountain..." />
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

        {/* Contacts */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Contacts</h2>
            <button type="button" onClick={addContact}
              className="flex items-center gap-2 text-[#ff5c39] font-['Inter:Medium',sans-serif] text-[14px] active:opacity-70">
              <Plus size={16} />
              Add Contact
            </button>
          </div>

          {formData.additionalContacts.map((contact, index) => (
            <div key={index} className="border border-[rgba(0,0,0,0.1)] rounded-[8px] p-3 space-y-3 relative">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
                  Contact {index + 1}{contact.name ? ` — ${contact.name}` : ''}
                </p>
                <button type="button" onClick={() => removeContact(index)}
                  className="p-1.5 rounded-[6px] bg-[#fff0ee] active:bg-[#ffe0da]">
                  <X size={14} className="text-[#ff5c39]" />
                </button>
              </div>
              <ContactForm
                contact={contact}
                onChange={(field, value) => updateContact(index, field, value)}
                knownTeamNames={knownTeamNames}
                compact
              />
            </div>
          ))}

          {formData.additionalContacts.length === 0 && (
            <p className="text-[#6a7282] text-[14px] text-center py-4 font-['Inter:Regular',sans-serif]">
              No contacts yet. Tap "Add Contact" to add one.
            </p>
          )}
        </div>

        {/* Save */}
        <button type="submit"
          className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
          Save Changes
        </button>

        {/* Delete Mountain */}
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="w-full flex items-center justify-center gap-2 bg-white border border-[rgba(255,92,57,0.3)] text-[#ff5c39] rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:bg-[#fff0ee]"
        >
          <Trash2 size={18} />
          Delete Mountain
        </button>

      </form>
    </div>
  );
}