import { useState, useMemo } from 'react';
import { useParams } from 'react-router';
import {
  CheckCircle, XCircle, Clock, Calendar, MapPin, Camera,
  Server, Phone, User, Truck, Building2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { toast } from 'sonner';

// ─── YULLR Logo ───────────────────────────────────────────────────────────────

function YullrLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-[18px]', md: 'text-[24px]', lg: 'text-[32px]' };
  return (
    <span className={`font-['Inter:Medium',sans-serif] font-medium tracking-tight text-[#1D2930] ${sizes[size]}`}>
      YULLR
    </span>
  );
}

// ─── Status Card ─────────────────────────────────────────────────────────────

function StatusCard({ label, done, note }: { label: string; done: boolean; note?: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-[12px] border ${done ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-white border-[rgba(0,0,0,0.08)]'}`}>
      {done
        ? <CheckCircle size={20} className="text-[#16a34a] shrink-0" />
        : <XCircle size={20} className="text-[#d1d5db] shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] font-['Inter:Medium',sans-serif] ${done ? 'text-[#16a34a]' : 'text-[#6a7282]'}`}>{label}</p>
        {note && <p className="text-[12px] text-[#6a7282] mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-[#1D2930]">{icon}</span>
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">{title}</h2>
        </div>
        {open ? <ChevronUp size={16} className="text-[#6a7282]" /> : <ChevronDown size={16} className="text-[#6a7282]" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────

export function MountainPortal() {
  const { mountainId } = useParams<{ mountainId: string }>();
  const { getMountainById, getLocationsByMountainId, updateMountain, addContact } = useData();

  const mountain = getMountainById(mountainId!);
  const locations = getLocationsByMountainId(mountainId!);

  // Proposed date selection
  const [selectedDates, setSelectedDates] = useState<string[]>(mountain?.proposedInstallDates || []);
  const [dateInput, setDateInput] = useState('');
  const [datesSaved, setDatesSaved] = useState(false);

  // Onsite contact form
  const [contactName, setContactName] = useState(mountain?.onsiteContact?.name || '');
  const [contactPhone, setContactPhone] = useState(mountain?.onsiteContact?.phone || '');
  const [contactSaved, setContactSaved] = useState(!!mountain?.onsiteContact);

  if (!mountain) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-6">
        <div className="text-center">
          <YullrLogo size="lg" />
          <p className="text-[#6a7282] mt-4 text-[16px]">Mountain not found.</p>
        </div>
      </div>
    );
  }

  const agreementSigned = !!mountain.proposalCreated;
  const hasAdminContact = !!(mountain.adminContact?.name && mountain.adminContact?.email);
  const hasTechContact = !!(mountain.technicalContact?.name && mountain.technicalContact?.email);

  const totalCameras = locations.reduce((sum, loc) => {
    const cams = loc.inspection?.items.filter(i => i.type === 'Camera').reduce((s, i) => s + (i.count || 1), 0) || 0;
    return sum + cams;
  }, 0);

  const locationsWithInspection = locations.filter(l => l.inspection);

  // ── Date selection ────────────────────────────────────────────────────────

  const addDate = () => {
    if (!dateInput) return;
    if (selectedDates.includes(dateInput)) { toast('Already added'); return; }
    if (selectedDates.length >= 3) { toast('Maximum 3 dates'); return; }
    setSelectedDates(prev => [...prev, dateInput].sort());
    setDateInput('');
    setDatesSaved(false);
  };

  const removeDate = (d: string) => {
    setSelectedDates(prev => prev.filter(x => x !== d));
    setDatesSaved(false);
  };

  const saveDates = () => {
    updateMountain(mountainId!, { proposedInstallDates: selectedDates });
    setDatesSaved(true);
    toast.success('Dates submitted — the YULLR team will confirm one shortly.');
  };

  // ── Onsite contact ────────────────────────────────────────────────────────

  const saveContact = () => {
    if (!contactName.trim()) { toast.error('Name is required'); return; }
    if (!contactPhone.trim()) { toast.error('Cell phone is required'); return; }
    const onsiteContact = { name: contactName.trim(), phone: contactPhone.trim() };
    updateMountain(mountainId!, { onsiteContact });
    // Sync to CRM
    addContact({
      name: contactName.trim(),
      email: '',
      phone: contactPhone.trim(),
      type: 'Resort',
      title: 'Onsite Install Contact',
      tags: [],
      isPrimary: false,
      mountainId: mountainId!,
      notes: `Onsite contact for ${mountain.name} install day`,
      activities: [],
    });
    setContactSaved(true);
    toast.success('Onsite contact saved');
  };

  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 7);
  const minDateStr = minDate.toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#f2f3f5]">
      {/* Header */}
      <div className="bg-[#1D2930] px-6 py-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <YullrLogo size="lg" />
          {mountain.mountainLogo ? (
            <img src={mountain.mountainLogo} alt={mountain.name} className="h-12 object-contain" />
          ) : (
            <div className="h-12 flex items-center">
              <p className="text-white text-[18px] font-['Inter:Medium',sans-serif]">{mountain.name}</p>
            </div>
          )}
        </div>
        <div className="max-w-2xl mx-auto mt-4">
          <h1 className="text-white text-[22px] font-['Inter:Medium',sans-serif]">{mountain.name} Install Coordinator</h1>
          <p className="text-[#8fa8b8] text-[14px] mt-1">Use this page to track your YULLR installation and share the information we need to make it a success.</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Status */}
        <Section title="Setup Status" icon={<CheckCircle size={18} />}>
          <div className="space-y-2">
            <StatusCard label="Customer Agreement Signed" done={agreementSigned} note={!agreementSigned ? 'Required before selecting install dates' : undefined} />
            <StatusCard label="Management Contact on File" done={hasAdminContact} note={!hasAdminContact ? 'Please contact your YULLR rep to update' : mountain.adminContact?.name} />
            <StatusCard label="Technical Contact on File" done={hasTechContact} note={!hasTechContact ? 'Please contact your YULLR rep to update' : mountain.technicalContact?.name} />
          </div>
        </Section>

        {/* Install dates */}
        <Section title="Proposed Install Dates" icon={<Calendar size={18} />}>
          {!agreementSigned ? (
            <div className="bg-[#fff4f1] rounded-[10px] px-4 py-3 flex items-center gap-2">
              <XCircle size={16} className="text-[#F95C39] shrink-0" />
              <p className="text-[13px] text-[#F95C39]">Please sign the customer agreement before selecting install dates.</p>
            </div>
          ) : mountain.confirmedInstallDate ? (
            <div className="bg-[#f0fdf4] rounded-[10px] px-4 py-4 text-center">
              <CheckCircle size={24} className="text-[#16a34a] mx-auto mb-2" />
              <p className="text-[15px] font-['Inter:Medium',sans-serif] text-[#16a34a]">Install Date Confirmed</p>
              <p className="text-[22px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mt-1">
                {new Date(mountain.confirmedInstallDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-[13px] text-[#6a7282] mt-2">The YULLR team will be in touch with final logistics details.</p>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-[#6a7282] mb-3">Select up to 3 potential dates. The YULLR team will review and confirm one.</p>

              {selectedDates.length > 0 && (
                <div className="space-y-2 mb-3">
                  {selectedDates.map(d => (
                    <div key={d} className="flex items-center justify-between bg-[#f3f3f5] rounded-[8px] px-3 py-2.5">
                      <span className="text-[14px] text-[#0a0a0a]">{new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                      <button onClick={() => removeDate(d)} className="text-[#6a7282] active:opacity-70 ml-2">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {selectedDates.length < 3 && (
                <div className="flex gap-2 mb-3">
                  <input
                    type="date"
                    value={dateInput}
                    min={minDateStr}
                    onChange={e => setDateInput(e.target.value)}
                    className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
                  />
                  <button onClick={addDate} disabled={!dateInput} className="px-4 bg-[#1D2930] text-white rounded-[8px] text-[14px] font-['Inter:Medium',sans-serif] disabled:opacity-40 active:opacity-80">
                    Add
                  </button>
                </div>
              )}

              {selectedDates.length > 0 && (
                <button
                  onClick={saveDates}
                  disabled={datesSaved}
                  className={`w-full py-3 rounded-[10px] font-['Inter:Medium',sans-serif] font-medium text-[15px] transition-colors ${datesSaved ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#F95C39] text-white active:opacity-80'}`}
                >
                  {datesSaved ? '✓ Dates Submitted' : `Submit ${selectedDates.length} Proposed Date${selectedDates.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </>
          )}
        </Section>

        {/* Install overview */}
        {locations.length > 0 && (
          <Section title="Install Overview" icon={<MapPin size={18} />}>
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-[#6a7282]">Install locations</span>
                <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{locations.length}</span>
              </div>
              {totalCameras > 0 && (
                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-[#6a7282]">Cameras</span>
                  <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{totalCameras}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {locations.map(loc => {
                const cameras = loc.inspection?.items.filter(i => i.type === 'Camera') || [];
                const cameraCount = cameras.reduce((s, i) => s + (i.count || 1), 0);
                return (
                  <div key={loc.id} className="border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-[#F95C39] shrink-0" />
                      <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{loc.name}</p>
                      {loc.difficulty && (
                        <span className="text-[11px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full ml-auto">Difficulty {loc.difficulty}/5</span>
                      )}
                    </div>
                    {cameraCount > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[#6a7282]">
                        <Camera size={12} /> {cameraCount} camera{cameraCount !== 1 ? 's' : ''}
                      </div>
                    )}
                    {loc.inspection?.notes && (
                      <p className="text-[12px] text-[#6a7282] mt-1">{loc.inspection.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Install day checklist */}
        <Section title="Install Day Checklist" icon={<Building2 size={18} />}>
          <p className="text-[13px] text-[#6a7282] mb-4">Please coordinate the following before the install team arrives.</p>

          {/* Onsite contact */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <User size={15} className="text-[#1D2930]" />
              <h3 className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Onsite Contact for Install Day</h3>
              {contactSaved && <CheckCircle size={14} className="text-[#16a34a]" />}
            </div>
            <p className="text-[12px] text-[#6a7282] mb-3">Provide the name and <strong>cell phone</strong> of the person who will be on site to assist during the install. They should be reachable throughout the day.</p>

            {contactSaved && mountain.onsiteContact ? (
              <div className="bg-[#f0fdf4] rounded-[10px] px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{mountain.onsiteContact.name}</p>
                  <p className="text-[13px] text-[#6a7282]">{mountain.onsiteContact.phone}</p>
                </div>
                <button onClick={() => setContactSaved(false)} className="text-[12px] text-[#6a7282] underline">Edit</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
                />
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="Cell phone (required)"
                    className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
                  />
                </div>
                <button onClick={saveContact} className="w-full bg-[#1D2930] text-white rounded-[8px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80">
                  Save Onsite Contact
                </button>
              </div>
            )}
          </div>

          {/* Access checklist */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={15} className="text-[#1D2930]" />
              <h3 className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Location Access</h3>
            </div>
            <div className="space-y-2">
              {[
                'All required buildings and server rooms will be unlocked or keys provided',
                'Roof or tower access points will be accessible with proper safety equipment available',
                'Network closet / IDF room access confirmed',
                'IT or facilities contact available to assist with access questions',
              ].map(item => (
                <div key={item} className="flex items-start gap-3 py-2 border-b border-[rgba(0,0,0,0.05)] last:border-0">
                  <div className="w-5 h-5 rounded-full border-2 border-[#d1d5db] shrink-0 mt-0.5" />
                  <p className="text-[13px] text-[#6a7282]">{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Equipment */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Truck size={15} className="text-[#1D2930]" />
              <h3 className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Equipment Coordination</h3>
            </div>
            <div className="space-y-2">
              {[
                'UTV or snowmobile available for on-hill travel to install locations',
                'Ladders appropriate for install heights (confirm with YULLR team)',
                'Boom or scissor lift arranged if needed for high-reach locations',
                'Ski patrol or mountain ops notified of install team on hill',
              ].map(item => (
                <div key={item} className="flex items-start gap-3 py-2 border-b border-[rgba(0,0,0,0.05)] last:border-0">
                  <div className="w-5 h-5 rounded-full border-2 border-[#d1d5db] shrink-0 mt-0.5" />
                  <p className="text-[13px] text-[#6a7282]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Footer */}
        <div className="text-center py-4">
          <YullrLogo size="sm" />
          <p className="text-[12px] text-[#6a7282] mt-1">Questions? Contact your YULLR team representative.</p>
        </div>
      </div>
    </div>
  );
}
