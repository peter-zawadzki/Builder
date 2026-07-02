import type { Contact } from '../context/DataContext';
import { formatPhone } from '../utils/formatPhone';

const ROLES = ['Admin', 'Technical', 'Team', 'Operations'] as const;
const PHONE_TYPES = ['Office', 'Cell'] as const;

interface ContactFormProps {
  contact: Contact;
  onChange: (field: keyof Contact, value: string) => void;
  knownTeamNames?: string[];
  compact?: boolean;
}

export function ContactForm({ contact, onChange, knownTeamNames = [], compact }: ContactFormProps) {
  const inputCls = `w-full bg-[#f3f3f5] rounded-[8px] px-3 ${compact ? 'py-2.5 text-[14px]' : 'py-3 text-[15px]'} text-[#0a0a0a] font-['Inter:Regular',sans-serif] focus:outline-none focus:ring-2 focus:ring-[#ff5c39]/30`;
  const labelCls = `block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium ${compact ? 'text-[13px]' : 'text-[14px]'} mb-1.5`;

  return (
    <div className="space-y-3">
      {/* Name */}
      <div>
        <label className={labelCls}>Name</label>
        <input
          type="text"
          value={contact.name || ''}
          onChange={e => onChange('name', e.target.value)}
          className={inputCls}
          placeholder="Full name"
        />
      </div>

      {/* Title */}
      <div>
        <label className={labelCls}>Title</label>
        <input
          type="text"
          value={contact.title || ''}
          onChange={e => onChange('title', e.target.value)}
          className={inputCls}
          placeholder="e.g., IT Director, Operations Manager"
        />
      </div>

      {/* Email */}
      <div>
        <label className={labelCls}>Email</label>
        <input
          type="email"
          value={contact.email || ''}
          onChange={e => onChange('email', e.target.value)}
          className={inputCls}
          placeholder="email@mountain.com"
        />
      </div>

      {/* Phone + type */}
      <div>
        <label className={labelCls}>Phone</label>
        <div className="flex gap-2">
          <input
            type="tel"
            value={contact.phone || ''}
            onChange={e => onChange('phone', formatPhone(e.target.value))}
            className={`${inputCls} flex-1`}
            placeholder="(555)123-4567"
          />
          <div className="flex gap-1 flex-shrink-0">
            {PHONE_TYPES.map(pt => (
              <button
                key={pt}
                type="button"
                onClick={() => onChange('phoneType', pt)}
                className={`px-3 ${compact ? 'py-2' : 'py-2.5'} rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] font-medium border transition-colors ${
                  (contact.phoneType || 'Office') === pt
                    ? 'bg-[#ff5c39] border-[#ff5c39] text-white'
                    : 'bg-[#f3f3f5] border-[rgba(0,0,0,0.1)] text-[#0a0a0a] active:bg-[#e8e8ea]'
                }`}
              >
                {pt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Role */}
      <div>
        <label className={labelCls}>Role</label>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map(role => (
            <button
              key={role}
              type="button"
              onClick={() => onChange('role', role)}
              className={`py-2.5 px-3 rounded-[8px] border text-[14px] font-['Inter:Medium',sans-serif] font-medium transition-colors ${
                contact.role === role
                  ? 'bg-[#ff5c39] border-[#ff5c39] text-white'
                  : 'bg-[#f3f3f5] border-[rgba(0,0,0,0.1)] text-[#0a0a0a] active:bg-[#e8e8ea]'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Team Name — only shown when Role = Team */}
      {contact.role === 'Team' && (
        <div>
          <label className={labelCls}>Team Name</label>
          {knownTeamNames.length > 0 ? (
            <select
              value={contact.teamName || ''}
              onChange={e => onChange('teamName', e.target.value)}
              className={inputCls}
            >
              <option value="">Select or enter team name</option>
              {knownTeamNames.map(tn => (
                <option key={tn} value={tn}>{tn}</option>
              ))}
              <option value="__new__">+ Enter new team name</option>
            </select>
          ) : null}
          {(knownTeamNames.length === 0 || contact.teamName === '__new__') && (
            <input
              type="text"
              value={contact.teamName === '__new__' ? '' : (contact.teamName || '')}
              onChange={e => onChange('teamName', e.target.value)}
              className={`${inputCls} ${knownTeamNames.length > 0 ? 'mt-2' : ''}`}
              placeholder="e.g., Snowmaking, Patrol, IT"
            />
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={contact.notes || ''}
          onChange={e => onChange('notes', e.target.value)}
          className={`${inputCls} min-h-[60px] resize-none`}
          placeholder="Additional notes…"
          rows={2}
        />
      </div>
    </div>
  );
}
