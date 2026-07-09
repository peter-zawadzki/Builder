import { useState } from 'react';
import { X, Check, MessageSquare, ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import { useData, getYullrMembers } from '../context/DataContext';
import type { ContactActivity } from '../context/DataContext';

// Shared "Notes & Action Items" block — used on Contacts, Organizations,
// Mountains, and Projects so assignment/tracking works the same everywhere.
// Assignee picker is limited to people in the YULLR organization.
export function ActivitySection({
  activities,
  onAdd,
  onToggle,
  onDelete,
}: {
  activities: ContactActivity[];
  onAdd: (entry: Omit<ContactActivity, 'id' | 'createdAt'>) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { contacts, organizations } = useData();
  const yullrMembers = getYullrMembers(contacts, organizations);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<'note' | 'action'>('note');
  const [assigneeId, setAssigneeId] = useState('');

  const sorted = [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const openActions = sorted.filter(a => a.type === 'action' && !a.completed);
  const doneActions = sorted.filter(a => a.type === 'action' && a.completed);
  const notes = sorted.filter(a => a.type === 'note');

  const add = () => {
    if (!newText.trim()) return;
    const assignee = yullrMembers.find(m => m.id === assigneeId);
    onAdd({
      text: newText.trim(),
      type: newType,
      completed: false,
      assigneeContactId: assignee?.id,
      assigneeName: assignee?.name,
    });
    setNewText('');
    setAssigneeId('');
    toast.success(newType === 'note' ? 'Note added' : 'Action item added');
  };

  const inputCls = 'w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none';

  return (
    <div className="space-y-4">
      {/* Add note / action */}
      <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={() => setNewType('note')} className={`flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${newType === 'note' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}><MessageSquare size={13} /> Note</button>
          <button onClick={() => setNewType('action')} className={`flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${newType === 'action' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}><ListTodo size={13} /> Action Item</button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder={newType === 'note' ? 'Add a note…' : 'Add an action item…'}
            className={inputCls}
          />
          <button onClick={add} className="px-4 bg-[#1D2930] text-white rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80 shrink-0">Add</button>
        </div>
        {yullrMembers.length > 0 && (
          <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
            <option value="">Assign to… (optional)</option>
            {yullrMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {/* Open action items */}
      {openActions.length > 0 && (
        <div>
          <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-2 flex items-center gap-1.5"><ListTodo size={12} /> Action Items ({openActions.length})</h3>
          <div className="space-y-2">
            {openActions.map(a => (
              <div key={a.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] px-3 py-2.5 flex items-start gap-3">
                <button onClick={() => onToggle(a.id)} className="w-5 h-5 rounded border-2 border-[#1D2930] flex items-center justify-center shrink-0 mt-0.5 active:opacity-70" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#0a0a0a]">{a.text}</p>
                  <p className="text-[11px] text-[#6a7282]">{new Date(a.createdAt).toLocaleDateString()}{a.assigneeName ? ` · → ${a.assigneeName}` : ''}</p>
                </div>
                <button onClick={() => onDelete(a.id)} className="p-1 active:opacity-70"><X size={12} className="text-[#6a7282]" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes timeline */}
      {notes.length > 0 && (
        <div>
          <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-2 flex items-center gap-1.5"><MessageSquare size={12} /> Notes</h3>
          <div className="space-y-2">
            {notes.map(n => (
              <div key={n.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] px-3 py-2.5">
                <p className="text-[13px] text-[#0a0a0a]">{n.text}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[11px] text-[#6a7282]">{new Date(n.createdAt).toLocaleString()}{n.assigneeName ? ` · → ${n.assigneeName}` : ''}</p>
                  <button onClick={() => onDelete(n.id)} className="p-1 active:opacity-70"><X size={12} className="text-[#6a7282]" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed actions */}
      {doneActions.length > 0 && (
        <div>
          <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-2">Completed Actions ({doneActions.length})</h3>
          <div className="space-y-2">
            {doneActions.map(a => (
              <div key={a.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.05)] px-3 py-2.5 flex items-start gap-3 opacity-60">
                <button onClick={() => onToggle(a.id)} className="w-5 h-5 rounded bg-[#1D2930] flex items-center justify-center shrink-0 mt-0.5"><Check size={11} className="text-white" /></button>
                <p className="text-[13px] text-[#6a7282] line-through flex-1">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
