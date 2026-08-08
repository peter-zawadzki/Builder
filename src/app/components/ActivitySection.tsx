import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { X, Check, MessageSquare, ListTodo, Lock, Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useData, getYullrMembers, canCompleteActivity, canEditOrArchiveNote } from '../context/DataContext';
import type { ContactActivity } from '../context/DataContext';
import { useMyContact } from '../hooks/useMyContact';
import { useIsSuperAdmin } from '../hooks/useRole';
import { ReplyThread } from './ReplyThread';

// Shared "Notes & Action Items" block — used on Contacts, Organizations,
// Mountains, Teams, Projects, and Inspections so assignment/tracking works the
// same everywhere. Assignable only to a person in the YULLR organization —
// not to a whole team. Every item is stamped with its creator. Actions:
// creator or assignee can mark complete (canCompleteActivity). Notes are
// stricter — only the creator can edit or archive (canEditOrArchiveNote);
// an assignee/tagged person is just notified and can reply.
export function ActivitySection({
  activities,
  onAdd,
  onToggle,
  onDelete,
  onArchive,
  onEdit,
  originCollection,
  originId,
}: {
  activities: ContactActivity[];
  onAdd: (entry: Omit<ContactActivity, 'id' | 'createdAt'>) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onEdit: (id: string, text: string) => void;
  // Identifies the parent record (e.g. { collection: 'mountains', id: mountainId })
  // so replies/notifications/search can resolve back to where a note lives —
  // omit only for entities not yet wired into the reply system.
  originCollection?: string;
  originId?: string;
}) {
  const { contacts, organizations } = useData();
  const { user } = useUser();
  const me = useMyContact();
  const isSuperAdmin = useIsSuperAdmin();
  const authorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const yullrMembers = getYullrMembers(contacts, organizations);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<'note' | 'action'>('note');
  const [assigneeId, setAssigneeId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const startEdit = (n: ContactActivity) => { setEditingId(n.id); setEditDraft(n.text); };
  const saveEdit = () => {
    if (!editingId || !editDraft.trim()) return;
    onEdit(editingId, editDraft.trim());
    setEditingId(null);
  };

  const sorted = [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const openActions = sorted.filter(a => a.type === 'action' && !a.completed);
  const doneActions = sorted.filter(a => a.type === 'action' && a.completed);
  const notes = sorted.filter(a => a.type === 'note' && !a.archived);
  const archivedNotes = sorted.filter(a => a.type === 'note' && a.archived);

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
              const canComplete = canCompleteActivity(a, me, isSuperAdmin);
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
      {(notes.length > 0 || archivedNotes.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide flex items-center gap-1.5"><MessageSquare size={12} /> Notes</h3>
            {archivedNotes.length > 0 && (
              <button onClick={() => setShowArchived(v => !v)} className="text-[11px] text-[#307fe2] active:opacity-70">
                {showArchived ? 'Hide archived' : `Archived (${archivedNotes.length})`}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(showArchived ? archivedNotes : notes).map(n => {
              const canEdit = canEditOrArchiveNote(n, me, isSuperAdmin);
              const isEditing = editingId === n.id;
              return (
                <div key={n.id} className={`bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] px-3 py-2.5 ${n.archived ? 'opacity-60' : ''}`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        rows={3}
                        className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] text-[#0a0a0a] outline-none resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-[6px] bg-[#f3f3f5] text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif]">Cancel</button>
                        <button onClick={saveEdit} disabled={!editDraft.trim()} className="px-3 py-1.5 rounded-[6px] bg-[#1D2930] text-white text-[12px] font-['Inter:Medium',sans-serif] disabled:opacity-40">Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[13px] text-[#0a0a0a]">{n.text}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[11px] text-[#6a7282]">
                          {n.authorName ? `${n.authorName} · ` : ''}{new Date(n.createdAt).toLocaleString()}{assigneeLabel(n) ? ` · ${assigneeLabel(n)}` : ''}
                        </p>
                        <div className="flex items-center gap-1">
                          {!n.archived && (
                            <button
                              onClick={() => canEdit && startEdit(n)}
                              disabled={!canEdit}
                              title={canEdit ? 'Edit' : 'Only the creator can edit this'}
                              className="p-1 active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Pencil size={12} className="text-[#6a7282]" />
                            </button>
                          )}
                          <button
                            onClick={() => canEdit && onArchive(n.id, !n.archived)}
                            disabled={!canEdit}
                            title={canEdit ? (n.archived ? 'Restore' : 'Archive') : `Only the creator can ${n.archived ? 'restore' : 'archive'} this`}
                            className="p-1 active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {n.archived ? <ArchiveRestore size={12} className="text-[#6a7282]" /> : <Archive size={12} className="text-[#6a7282]" />}
                          </button>
                        </div>
                      </div>
                      {originCollection && originId && !n.archived && (
                        <ReplyThread noteRef={{ noteSource: 'activity', noteId: n.id, originCollection, originId }} />
                      )}
                    </>
                  )}
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
              const canComplete = canCompleteActivity(a, me, isSuperAdmin);
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
