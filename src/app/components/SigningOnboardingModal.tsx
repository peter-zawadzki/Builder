import { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

const API_BASE = '/api/public/proposal-sign';

export interface TechContactRow {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
}

export interface InstallWindowRow {
  isRange: boolean;
  start: string;
  end: string;
}

function emptyContact(): TechContactRow {
  return { firstName: '', lastName: '', title: '', email: '', phone: '' };
}

const inputStyle: React.CSSProperties = {
  border: '1px solid rgba(0,0,0,0.14)', borderRadius: 7, padding: '9px 10px',
  fontSize: 13.5, color: '#1a1a1a', outline: 'none', fontFamily: 'Inter, sans-serif',
  width: '100%', boxSizing: 'border-box',
};
const addRowBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed #ccc',
  borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#555', cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

// Shown immediately after a customer signs their proposal (SigningPage.tsx),
// and reachable again later via the "Outstanding items" banner if skipped.
// Collects Technical Contact(s) — created as real CRM contacts tied to the
// mountain via POST /api/public/proposal-sign/:token/onboarding, replacing
// the Customer Agreement's old manually-entered Technical Administrator(s)
// section — plus optional preferred install dates/ranges.
export function OnboardingModal({
  token, caUrl, onClose, onSaved,
}: {
  token: string;
  caUrl?: string | null;
  onClose: () => void;
  onSaved: (technicalContactAdded: boolean, installWindowsAdded: boolean) => void;
}) {
  const [contacts, setContacts] = useState<TechContactRow[]>([emptyContact()]);
  const [windows, setWindows] = useState<InstallWindowRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setContactField = (i: number, field: keyof TechContactRow, value: string) =>
    setContacts(prev => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  const addContactRow = () => setContacts(prev => [...prev, emptyContact()]);
  const removeContactRow = (i: number) => setContacts(prev => prev.filter((_, idx) => idx !== i));

  const addWindow = (isRange: boolean) => setWindows(prev => [...prev, { isRange, start: '', end: '' }]);
  const setWindowField = (i: number, field: 'start' | 'end', value: string) =>
    setWindows(prev => prev.map((w, idx) => (idx === i ? { ...w, [field]: value } : w)));
  const removeWindow = (i: number) => setWindows(prev => prev.filter((_, idx) => idx !== i));

  const validContacts = contacts.filter(c => c.firstName.trim() && c.lastName.trim() && c.email.trim());
  const validWindows = windows
    .filter(w => w.start)
    .map(w => ({ start: w.start, end: w.isRange ? (w.end || undefined) : undefined }));

  const submit = async (skipContacts: boolean) => {
    if (!skipContacts && validContacts.length === 0) {
      setError('Add at least one Technical Contact (first name, last name, and email) to continue, or skip for now.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/${token}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technicalContacts: skipContacts ? [] : validContacts,
          installWindows: validWindows,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save — please try again.');
      const technicalContactAdded = !skipContacts && validContacts.length > 0;
      const installWindowsAdded = validWindows.length > 0;
      if (technicalContactAdded && caUrl) window.open(caUrl, '_blank', 'noopener,noreferrer');
      onSaved(technicalContactAdded, installWindowsAdded);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 28, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: '#FF5C39', textTransform: 'uppercase', letterSpacing: 0.6, margin: 0 }}>
            Technical Contact(s)
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
            <X size={18} color="#888" />
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
          Designate the individual(s) at your facility who will serve as the primary point of contact for the YULLR integration. This person will coordinate scheduling, technical requirements, and onsite activities with the YULLR team.
        </p>

        {contacts.map((c, i) => (
          <div key={i} style={{ border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 10, position: 'relative' }}>
            {contacts.length > 1 && (
              <button onClick={() => removeContactRow(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0 }}>
                <X size={14} color="#aaa" />
              </button>
            )}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.4 }}>
              {i === 0 ? 'Primary Technical Contact' : `Technical Contact ${i + 1}`}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input placeholder="First Name *" value={c.firstName} onChange={e => setContactField(i, 'firstName', e.target.value)} style={inputStyle} />
              <input placeholder="Last Name *" value={c.lastName} onChange={e => setContactField(i, 'lastName', e.target.value)} style={inputStyle} />
            </div>
            <input placeholder="Title" value={c.title} onChange={e => setContactField(i, 'title', e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="Email *" type="email" value={c.email} onChange={e => setContactField(i, 'email', e.target.value)} style={inputStyle} />
              <input placeholder="Phone" type="tel" value={c.phone} onChange={e => setContactField(i, 'phone', e.target.value)} style={inputStyle} />
            </div>
          </div>
        ))}
        <button onClick={addContactRow} style={addRowBtnStyle}>
          <Plus size={13} /> Add another contact
        </button>

        <div style={{ borderTop: '1px solid #eee', marginTop: 22, paddingTop: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Preferred Install Dates
          </p>
          <p style={{ fontSize: 12.5, color: '#777', marginBottom: 12 }}>
            Let us know which days or date ranges work best for your install — add as many as you'd like.
          </p>
          {windows.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type="date" value={w.start} onChange={e => setWindowField(i, 'start', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              {w.isRange && (
                <>
                  <span style={{ fontSize: 12, color: '#999' }}>to</span>
                  <input type="date" value={w.end} onChange={e => setWindowField(i, 'end', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                </>
              )}
              <button onClick={() => removeWindow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}>
                <X size={14} color="#aaa" />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => addWindow(false)} style={addRowBtnStyle}><Plus size={13} /> Add a date</button>
            <button onClick={() => addWindow(true)} style={addRowBtnStyle}><Plus size={13} /> Add a date range</button>
          </div>
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginTop: 16 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            style={{ flex: 1, background: '#f3f3f5', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1, fontFamily: 'Inter, sans-serif' }}
          >
            Skip for now
          </button>
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            style={{ flex: 2, background: '#FF5C39', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13.5, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'Inter, sans-serif' }}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Continue to Customer Agreement
          </button>
        </div>
      </div>
    </div>
  );
}
