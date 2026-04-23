import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Contact } from '../context/DataContext';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatPhone } from '../utils/formatPhone';
import { ContactForm } from './ContactForm';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddableSelect } from './AddableSelect';

const DEFAULT_PARENT_ORGS = ['Altera Mountain Co', 'Boyne Resorts', 'Powder Corporation', 'Vail Resorts'];

const emptyContact = (): Contact => ({
  name: '', title: '', email: '', phone: '', phoneType: 'Office', role: undefined, teamName: '', notes: '',
});

export function CreateMountain() {
  const navigate = useNavigate();
  const { addMountain } = useData();

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    billingAddress: '',
    parentOrganization: '',
    legalEntity: '',
    phone: '',
    website: '',
    notes: '',
    ipSubnet: '',
    additionalContacts: [] as Contact[],
  });

  const [billingSameAsMain, setBillingSameAsMain] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    addMountain({
      ...formData,
      billingAddress: billingSameAsMain ? formData.address : formData.billingAddress,
      email: '',
      adminContact: emptyContact(),
      technicalContact: emptyContact(),
    });
    toast.success('Mountain added successfully!');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#F2F3F5]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(29,41,48,0.08)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#1D2930]" />
          </button>
          <h1 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[20px]">Add Mountain</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6 pb-20">

        {/* Basic Info */}
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4 space-y-4">
          <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Basic Information</h2>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">Mountain Name *</label>
            <input type="text" required value={formData.name} onChange={e => updateField('name', e.target.value)}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif]"
              placeholder="e.g., Whistler Mountain" autoFocus />
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">Address *</label>
            <AddressAutocomplete
              value={formData.address}
              onChange={v => updateField('address', v)}
              placeholder="Search resort name or enter address"
            />
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">Phone</label>
            <input type="tel" value={formData.phone} onChange={e => updateField('phone', formatPhone(e.target.value))}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif]"
              placeholder="(555)123-4567" />
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">Website</label>
            <input type="url" value={formData.website} onChange={e => updateField('website', e.target.value)}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif]"
              placeholder="https://mountain.com" />
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">IP Subnet</label>
            <input type="text" value={formData.ipSubnet} onChange={e => updateField('ipSubnet', e.target.value)}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif]"
              placeholder="e.g. 192.168.1." />
            <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[12px] mt-1">
              Default IP prefix for all assets at this mountain
            </p>
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">Notes</label>
            <textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif] min-h-[80px]"
              placeholder="Additional notes about this mountain..." />
          </div>
        </div>

        {/* Organization & Billing */}
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4 space-y-4">
          <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Organization & Billing</h2>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">Parent Organization</label>
            <AddableSelect
              optionKey="mountain:parentOrganizations"
              value={formData.parentOrganization}
              onChange={v => updateField('parentOrganization', v)}
              placeholder="Select organization"
              defaultOptions={DEFAULT_PARENT_ORGS}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px]"
            />
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-2">Legal Entity</label>
            <input
              type="text"
              value={formData.legalEntity}
              onChange={e => updateField('legalEntity', e.target.value)}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif]"
              placeholder="e.g., Whistler Mountain Resort Ltd."
            />
            <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[12px] mt-1">
              Full legal name used for contracts and agreements
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[#6D7B83] font-['Inter:Medium',sans-serif] font-medium text-[13px]">Billing Address</label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative ${billingSameAsMain ? 'bg-[#307FE2]' : 'bg-[#C9CDD2]'}`}
                  onClick={() => setBillingSameAsMain(v => !v)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${billingSameAsMain ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">Same as address</span>
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
              <div className="bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[14px]">
                {formData.address || 'Same as mountain address'}
              </div>
            )}
          </div>
        </div>

        {/* Contacts */}
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Contacts</h2>
            <button type="button" onClick={addContact}
              className="flex items-center gap-2 text-[#F95C39] font-['Inter:Medium',sans-serif] text-[14px] active:opacity-70">
              <Plus size={16} />
              Add Contact
            </button>
          </div>

          {formData.additionalContacts.map((contact, index) => (
            <div key={index} className="border border-[rgba(29,41,48,0.1)] rounded-[10px] p-3 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
                  Contact {index + 1}{contact.name ? ` — ${contact.name}` : ''}
                </p>
                <button type="button" onClick={() => removeContact(index)}
                  className="p-1.5 rounded-[6px] bg-[#FFEDE9] active:bg-[#FFCFC9]">
                  <X size={14} className="text-[#F95C39]" />
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
            <p className="text-[#6D7B83] text-[14px] text-center py-4 font-['Inter:Regular',sans-serif]">
              No contacts yet. Tap "Add Contact" to add one.
            </p>
          )}
        </div>

        <button type="submit"
          className="w-full bg-[#F95C39] text-white rounded-[10px] px-4 py-4 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:opacity-80">
          Add Mountain
        </button>
      </form>
    </div>
  );
}