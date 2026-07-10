import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { X, Check, MessageSquare, ListTodo, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useData, getYullrMembers, canCompleteActivity } from '../context/DataContext';
import type { ContactActivity } from '../context/DataContext';
import { useMyContact } from '../hooks/useMyContact';

// Shared "Notes & Action Items" block — used on Contacts, Organizations,
// Mountains, Teams, Projects, and Inspections so assignment/tracking works the
// same everywhere. Assignable only to a person in the YULLR organization —
// not to a whole team. Every item is stamped with its creator; only the
// creator or assignee can mark an action item complete.
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
  const { user } = useUser();
  const me = useMyContact();
  const authorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
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
      authorContactId: me?.id,
      authorName,
    });
    setNewText('');
    setAssigneeId('');
    toast.success(newType === 'note' ? 'Note added' : 'Action item added');
  };

  const inputCls = 'w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none';

  const assigneeLabel = (a: ContactActivity) => a.assigneeName ? `→ ${a.assigneeName}` : '';

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
            {openActions.map(a => {
              const canComplete = canCompleteActivity(a, me);
              return (
                <div key={a.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] px-3 py-2.5 flex items-start gap-3">
                  <button
                    onClick={() => canComplete && onToggle(a.id)}
                    disabled={!canComplete}
                    title={canComplete ? 'Mark complete' : 'Only the creator or assignee can complete this'}
                    className="w-5 h-5 rounded border-2 border-[#1D2930] flex items-center justify-center shrink-0 mt-0.5 active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {!canComplete && <Lock size={10} className="text-[#1D2930]" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#0a0a0a]">{a.text}</p>
                    <p className="text-[11px] text-[#6a7282]">
                      {a.authorName ? `${a.authorName} · ` : ''}{new Date(a.createdAt).toLocaleDateString()}{assigneeLabel(a) ? ` · ${assigneeLabel(a)}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => canComplete && onDelete(a.id)}
                    disabled={!canComplete}
                    title={canComplete ? 'Delete' : 'Only the creator or assignee can delete this'}
                    className="p-1 active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <X size={12} className="text-[#6a7282]" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes timeline */}
      {notes.length > 0 && (
        <div>
          <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-2 flex items-center gap-1.5"><MessageSquare size={12} /> Notes</h3>
          <div className="space-y-2">
            {notes.map(n => {
              const canDelete = canCompleteActivity(n, me);
              return (
                <div key={n.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] px-3 py-2.5">
                  <p className="text-[13px] text-[#0a0a0a]">{n.text}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-[#6a7282]">
                      {n.authorName ? `${n.authorName} · ` : ''}{new Date(n.createdAt).toLocaleString()}{assigneeLabel(n) ? ` · ${assigneeLabel(n)}` : ''}
                    </p>
                    <button
                      onClick={() => canDelete && onDelete(n.id)}
                      disabled={!canDelete}
                      title={canDelete ? 'Delete' : 'Only the creator or assignee can delete this'}
                      className="p-1 active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <X size={12} className="text-[#6a7282]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed actions */}
      {doneActions.length > 0 && (
        <div>
          <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-2">Completed Actions ({doneActions.length})</h3>
          <div className="space-y-2">
            {doneActions.map(a => {
              const canComplete = canCompleteActivity(a, me);
              return (
                <div key={a.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.05)] px-3 py-2.5 flex items-start gap-3 opacity-60">
                  <button
                    onClick={() => canComplete && onToggle(a.id)}
                    disabled={!canComplete}
                    title={canComplete ? 'Reopen' : 'Only the creator or assignee can reopen this'}
                    className="w-5 h-5 rounded bg-[#1D2930] flex items-center justify-center shrink-0 mt-0.5 disabled:cursor-not-allowed"
                  >
                    <Check size={11} className="text-white" />
                  </button>
                  <p className="text-[13px] text-[#6a7282] line-through flex-1">{a.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
