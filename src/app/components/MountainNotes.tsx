import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, Check, X, StickyNote, ChevronDown, PlusCircle, Maximize2, Lock } from 'lucide-react';
import { useData, getYullrMembers, getMountainRollupActivities, canCompleteActivity, MountainNote, NoteTopic } from '../context/DataContext';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { RollupNoteRow, RollupEmptyState } from './MountainActivityRollup';
import { useMyContact } from '../hooks/useMyContact';

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatFullDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' at '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const TOPICS: NoteTopic[] = ['Demo', 'Site Visit', 'Proposal', 'Install', 'Training', 'Updates'];

interface NoteCardProps {
  note: MountainNote;
  onUpdate: (id: string, updates: Partial<MountainNote>) => void;
  forceExpanded?: boolean;
}

function NoteCard({ note, onUpdate, forceExpanded }: NoteCardProps) {
  const me = useMyContact();
  const canArchive = canCompleteActivity(note, me);
  const archiveNote = () => canArchive && onUpdate(note.id, { archived: true });
  const [isExpanded, setIsExpanded] = useState(forceExpanded || false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingTo, setIsAddingTo] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [additionText, setAdditionText] = useState('');
  const [draftTopic, setDraftTopic] = useState<NoteTopic | undefined>(note.topic);
  const [draftScheduled, setDraftScheduled] = useState(!!note.scheduled);
  const [draftCompleted, setDraftCompleted] = useState(!!note.completed);
  const [draftInstallProgress, setDraftInstallProgress] = useState<number | undefined>(note.installProgress);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const additionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (forceExpanded) setIsExpanded(true);
  }, [forceExpanded]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [isEditing]);

  useEffect(() => {
    if (isAddingTo && additionTextareaRef.current) {
      additionTextareaRef.current.focus();
    }
  }, [isAddingTo]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const updates: Partial<MountainNote> = { text: trimmed };
    if (draftTopic) {
      updates.topic = draftTopic;
      if (draftTopic === 'Install') {
        updates.installProgress = draftInstallProgress;
        updates.scheduled = undefined;
        updates.completed = undefined;
      } else {
        updates.scheduled = draftScheduled;
        updates.completed = draftCompleted;
        updates.installProgress = undefined;
      }
    } else {
      // Remove topic fields if switching to general note
      updates.topic = undefined;
      updates.scheduled = undefined;
      updates.completed = undefined;
      updates.installProgress = undefined;
    }
    onUpdate(note.id, updates);
    setIsEditing(false);
    setIsExpanded(false);
  };

  const handleCancel = () => {
    setDraft(note.text);
    setDraftTopic(note.topic);
    setDraftScheduled(!!note.scheduled);
    setDraftCompleted(!!note.completed);
    setDraftInstallProgress(note.installProgress);
    setIsEditing(false);
  };

  const handleSaveAddition = () => {
    const trimmed = additionText.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const newEntry = {
      id: crypto.randomUUID(),
      text: trimmed,
      timestamp: now,
    };

    const currentEntries = note.entries || [];
    onUpdate(note.id, { entries: [...currentEntries, newEntry] });
    setAdditionText('');
    setIsAddingTo(false);
    setIsExpanded(true);
  };

  const handleDeleteEntry = (entryId: string) => {
    setDeleteEntryId(null);
    const currentEntries = note.entries || [];
    onUpdate(note.id, { entries: currentEntries.filter(e => e.id !== entryId) });
  };

  const handleCancelAddition = () => {
    setAdditionText('');
    setIsAddingTo(false);
  };

  const wasEdited = note.updatedAt !== note.createdAt;

  const topicBadgeColor = note.topic
    ? note.completed
      ? 'bg-[#22c55e] text-white'
      : note.scheduled
      ? 'bg-[#fbbf24] text-white'
      : 'bg-[#e5e7eb] text-[#6a7282]'
    : '';

  // ── Add to mode ────────────────────────────────────────────────────────────
  if (isAddingTo) {
    const notePreview = note.text.split('\n')[0];
    const displayText = notePreview.length > 40 ? notePreview.substring(0, 40) + '...' : notePreview;
    return (
      <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px] p-4">
        <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px] mb-2">
          Add to: {displayText}
        </p>
        <textarea
          ref={additionTextareaRef}
          value={additionText}
          onChange={e => setAdditionText(e.target.value)}
          rows={3}
          className="w-full bg-white border border-[#307FE2] rounded-[8px] px-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30"
          placeholder="Add additional note (will be timestamped)..."
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleSaveAddition}
            disabled={!additionText.trim()}
            className="flex-1 bg-[#307FE2] text-white rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-40"
          >
            <Check size={16} />
            Add
          </button>
          <button
            onClick={handleCancelAddition}
            className="flex-1 bg-white border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#f3f3f5]"
          >
            <X size={16} />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px] p-4">
        {/* Topic selection */}
        <div className="mb-3">
          <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px] mb-1.5">
            Topic (optional)
          </label>
          <select
            value={draftTopic || ''}
            onChange={e => {
              const val = e.target.value as NoteTopic | '';
              setDraftTopic(val || undefined);
              if (!val) {
                setDraftScheduled(false);
                setDraftCompleted(false);
              }
            }}
            className="w-full bg-white border border-[#307FE2] rounded-[8px] px-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]"
          >
            <option value="">General Note</option>
            {TOPICS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Status controls (only show if topic selected) */}
        {draftTopic && draftTopic === 'Install' ? (
          <div className="mb-3">
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px] mb-1.5">
              Install Progress
            </label>
            <select
              value={draftInstallProgress ?? ''}
              onChange={e => setDraftInstallProgress(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-white border border-[#307FE2] rounded-[8px] px-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]"
            >
              <option value="">Not Started</option>
              <option value="0">Scheduled</option>
              <option value="25">25%</option>
              <option value="50">50%</option>
              <option value="75">75%</option>
              <option value="100">Completed</option>
            </select>
          </div>
        ) : draftTopic ? (
          <div className="flex gap-3 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draftScheduled}
                onChange={e => setDraftScheduled(e.target.checked)}
                className="w-4 h-4 rounded border-[#307FE2] text-[#fbbf24] focus:ring-[#307FE2]"
              />
              <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                {draftTopic === 'Proposal' ? 'Submitted' : 'Scheduled'}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draftCompleted}
                onChange={e => setDraftCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-[#307FE2] text-[#22c55e] focus:ring-[#307FE2]"
              />
              <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                {draftTopic === 'Proposal' ? 'Signed' : 'Completed'}
              </span>
            </label>
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          className="w-full bg-white border border-[#307FE2] rounded-[8px] px-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30"
          placeholder="Write your note here…"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleSave}
            disabled={!draft.trim()}
            className="flex-1 bg-[#307FE2] text-white rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-40"
          >
            <Check size={16} />
            Save
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 bg-white border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#f3f3f5]"
          >
            <X size={16} />
            Cancel
          </button>
          <button
            onClick={archiveNote}
            disabled={!canArchive}
            className="bg-[#fff0ee] border border-[rgba(255,92,57,0.2)] rounded-[8px] py-2.5 px-3 flex items-center justify-center active:bg-[#ffe0da] disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Archive note"
            title={canArchive ? 'Archive' : 'Only the creator or assignee can archive this'}
          >
            <Archive size={16} className="text-[#ff5c39]" />
          </button>
        </div>
      </div>
    );
  }

  // ── Expanded view ──────────────────────────────────────────────────────────
  if (isExpanded) {
    return (
      <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-[10px]">
        {/* Collapsed-style header — tap to collapse */}
        <div
          role="button"
          tabIndex={0}
          className="w-full flex items-center gap-2 px-3 py-3 active:bg-[#f9fafb] rounded-t-[10px] transition-colors cursor-pointer"
          onClick={() => setIsExpanded(false)}
          onKeyDown={e => e.key === 'Enter' && setIsExpanded(false)}
        >
          <ChevronDown size={15} className="text-[#307FE2] flex-shrink-0 rotate-180 transition-transform" />
          {note.topic && (
            <span className={`text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${topicBadgeColor}`}>
              {note.topic}
            </span>
          )}
          <span className="flex-1 text-left text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] truncate">
            {note.text.split('\n')[0]}
          </span>
          <span className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[12px] flex-shrink-0">
            {note.authorName ? `${note.authorName} · ` : ''}{formatShortDate(note.updatedAt)}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setIsAddingTo(true); }}
            className="p-1.5 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
            aria-label="Add to note"
            title="Add to note"
          >
            <PlusCircle size={14} className="text-[#307FE2]" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setIsEditing(true); }}
            className="p-1.5 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
            aria-label="Edit note"
            title="Edit note"
          >
            <Pencil size={14} className="text-[#307FE2]" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); archiveNote(); }}
            disabled={!canArchive}
            className="p-1.5 rounded-[6px] active:bg-[#ffe0da] flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Archive note"
            title={canArchive ? 'Archive' : 'Only the creator or assignee can archive this'}
          >
            {canArchive ? <Archive size={14} className="text-[#ff5c39]" /> : <Lock size={12} className="text-[#ff5c39]" />}
          </button>
        </div>

        {/* Expanded body */}
        <div className="px-4 pb-4 pt-1 border-t border-[rgba(0,0,0,0.06)]">
          <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] leading-relaxed whitespace-pre-wrap">
            {note.text}
          </p>
          <div className="flex items-center justify-between mt-3 flex-wrap gap-1.5">
            <p className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[12px]">
              {note.authorName ? `${note.authorName} · ` : ''}{wasEdited ? 'Edited ' : ''}{formatFullDateTime(note.updatedAt)}
              {note.assigneeName ? ` · → ${note.assigneeName}` : ''}
            </p>
            <button
              onClick={() => { setIsExpanded(false); setIsAddingTo(true); }}
              className="flex items-center gap-1 text-[#307FE2] font-['Inter:Medium',sans-serif] text-[12px] px-2 py-1 rounded-[6px] active:bg-[#f9fafb]"
            >
              <PlusCircle size={13} />
              Add to Note
            </button>
          </div>

          {/* Additional entries */}
          {note.entries && note.entries.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] space-y-2">
              {note.entries.map((entry) => (
                <div key={entry.id} className="bg-[#f9fafb] rounded-[6px] p-2.5 border border-[rgba(0,0,0,0.06)] group relative">
                  <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px] leading-relaxed whitespace-pre-wrap mb-1 pr-6">
                    {entry.text}
                  </p>
                  <p className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[11px]">
                    {formatFullDateTime(entry.timestamp)}
                  </p>
                  <button
                    onClick={() => setDeleteEntryId(entry.id)}
                    className="absolute top-2 right-2 p-1 rounded-[4px] opacity-0 group-hover:opacity-100 active:bg-[#C5DEFF] transition-opacity"
                    aria-label="Delete entry"
                  >
                    <Trash2 size={12} className="text-[#ff5c39]" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Collapsed view (default) ───────────────────────────────────────────────
  return (
    <>
      <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-[10px]">
        <div
          role="button"
          tabIndex={0}
          className="w-full flex items-center gap-2 px-3 py-3 active:bg-[#f9fafb] rounded-[10px] transition-colors cursor-pointer"
          onClick={() => setIsExpanded(true)}
          onKeyDown={e => e.key === 'Enter' && setIsExpanded(true)}
        >
          <ChevronDown size={15} className="text-[#307FE2] flex-shrink-0" />
          {note.topic && (
            <span className={`text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${topicBadgeColor}`}>
              {note.topic}
            </span>
          )}
          <span className="flex-1 text-left text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] truncate min-w-0">
            {note.text.split('\n')[0]}
          </span>
          <span className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[12px] flex-shrink-0 ml-1">
            {note.authorName ? `${note.authorName} · ` : ''}{formatShortDate(note.updatedAt)}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setIsAddingTo(true); }}
            className="p-1.5 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
            aria-label="Add to note"
            title="Add to note"
          >
            <PlusCircle size={14} className="text-[#307FE2]" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setIsEditing(true); }}
            className="p-1.5 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
            aria-label="Edit note"
            title="Edit note"
          >
            <Pencil size={14} className="text-[#307FE2]" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); archiveNote(); }}
            disabled={!canArchive}
            className="p-1.5 rounded-[6px] active:bg-[#ffe0da] flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Archive note"
            title={canArchive ? 'Archive' : 'Only the creator or assignee can archive this'}
          >
            {canArchive ? <Archive size={14} className="text-[#ff5c39]" /> : <Lock size={12} className="text-[#ff5c39]" />}
          </button>
        </div>
      </div>

      {/* Delete entry confirmation */}
      {deleteEntryId && (() => {
        const entry = note.entries?.find(e => e.id === deleteEntryId);
        if (!entry) return null;
        return (
          <DeleteConfirmModal
            title="Delete entry?"
            description={
              <>
                This will permanently delete the entry:{' '}
                <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                  "{entry.text.substring(0, 50)}{entry.text.length > 50 ? '...' : ''}"
                </span>
                . This cannot be undone.
              </>
            }
            onConfirm={() => handleDeleteEntry(deleteEntryId)}
            onCancel={() => setDeleteEntryId(null)}
          />
        );
      })()}
    </>
  );
}

interface MountainNotesProps {
  mountainId: string;
  onExpandClick?: () => void;
}

export function MountainNotes({ mountainId, onExpandClick }: MountainNotesProps) {
  const location = useLocation();
  const { user } = useUser();
  const me = useMyContact();
  const authorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const { addNote, updateNote, getNotesByMountainId, contacts, organizations, mountains, teams, projects, locations } = useData();
  const yullrMembers = getYullrMembers(contacts, organizations);
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const newTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [highlightedTopic, setHighlightedTopic] = useState<NoteTopic | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const allNotes = getNotesByMountainId(mountainId);
  const notes = allNotes.filter(n => !n.archived);
  const archivedNotes = allNotes.filter(n => n.archived);

  // Handle scroll-to-topic from navigation state
  useEffect(() => {
    const state = location.state as any;
    if (state?.scrollToTopic) {
      setHighlightedTopic(state.scrollToTopic);
      // Clear state after a short delay
      setTimeout(() => setHighlightedTopic(null), 3000);
    }
  }, [location.state]);

  useEffect(() => {
    if (isAdding && newTextareaRef.current) {
      newTextareaRef.current.focus();
    }
  }, [isAdding]);

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;

    const id = addNote(mountainId, trimmed, undefined, undefined, undefined, undefined, authorName);

    const assignee = newAssigneeId ? yullrMembers.find(m => m.id === newAssigneeId) : undefined;
    updateNote(id, {
      authorContactId: me?.id,
      ...(assignee ? { assigneeContactId: assignee.id, assigneeName: assignee.name } : {}),
    });

    setNewText('');
    setNewAssigneeId('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewText('');
    setIsAdding(false);
  };

  const handleUpdate = (id: string, updates: Partial<MountainNote>) => {
    // If changing topic, check for conflicts
    if (updates.topic !== undefined && updates.topic && notes.some(n => n.id !== id && n.topic === updates.topic)) {
      alert(`A ${updates.topic} note already exists. Please choose a different topic.`);
      return;
    }

    updateNote(id, updates);
  };

  // Separate topic notes from general notes
  const topicNotes = notes.filter(n => n.topic);
  const generalNotes = notes.filter(n => !n.topic);

  // Rolled-up notes — from associated contacts/teams/projects/inspections, or
  // assigned to a person associated with this mountain. Created at their
  // source, not here. Merged into the same flat feed as general notes (no
  // separate section), matching how Next Actions merges everything together.
  const rollupNotes = getMountainRollupActivities(mountainId, { mountains, contacts, teams, projects, locations }).filter(a => a.type === 'note');
  const generalFeed = [
    ...generalNotes.map(note => ({ kind: 'own' as const, note, date: new Date(note.updatedAt).getTime() })),
    ...rollupNotes.map(entry => ({ kind: 'rollup' as const, entry, date: new Date(entry.createdAt).getTime() })),
  ].sort((a, b) => b.date - a.date);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        {onExpandClick ? (
          <button onClick={onExpandClick} className="flex items-center gap-2 active:opacity-70">
            <Maximize2 size={15} className="text-[#6a7282]" />
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
              Notes
            </h2>
          </button>
        ) : (
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
            Notes
          </h2>
        )}
        <div className="flex items-center gap-2">
          {archivedNotes.length > 0 && (
            <button
              onClick={() => setShowArchived(v => !v)}
              className={`px-2.5 py-1.5 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] ${showArchived ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
            >
              {showArchived ? 'Hide archived' : `Archived (${archivedNotes.length})`}
            </button>
          )}
          <button
            onClick={() => setIsAdding(true)}
            className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
          >
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      {/* Add note modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) handleCancelAdd(); }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Add Note</h2>
              <button onClick={handleCancelAdd} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
            </div>
            <textarea
              ref={newTextareaRef}
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder="Write your note here…"
              rows={4}
              className="w-full bg-[#f3f3f5] border border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30 placeholder:text-[#9ca3af]"
            />
            {yullrMembers.length > 0 && (
              <select
                value={newAssigneeId}
                onChange={e => setNewAssigneeId(e.target.value)}
                className="w-full mt-2 bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] text-[#0a0a0a] outline-none"
              >
                <option value="">Assign to… (optional)</option>
                {yullrMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleCancelAdd}
                className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#e8e8ea]"
              >
                <X size={16} />
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newText.trim()}
                className="flex-1 bg-[#307FE2] text-white rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-40"
              >
                <Check size={16} />
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto max-h-[600px]">
        {showArchived ? (
          archivedNotes.length === 0 ? (
            <div className="text-[13px] text-[#8992a0] text-center py-6">No archived notes.</div>
          ) : (
            <div className="space-y-2">
              {archivedNotes.map(note => (
                <ArchivedNoteRow key={note.id} note={note} me={me} onRestore={() => updateNote(note.id, { archived: false })} />
              ))}
            </div>
          )
        ) : topicNotes.length === 0 && generalFeed.length === 0 && !isAdding ? (
          <RollupEmptyState icon={StickyNote} message="No notes yet. Add a note to capture important details." />
        ) : (
          <div className="space-y-4">
            {/* Topic notes */}
            {topicNotes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[#6a7282] font-['Inter:Medium',sans-serif] text-[12px] uppercase tracking-wider">
                  Sales Process
                </h3>
                {topicNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onUpdate={handleUpdate}
                    forceExpanded={highlightedTopic === note.topic}
                  />
                ))}
              </div>
            )}

            {/* General notes — the mountain's own topic-less notes, interleaved
                with rolled-up notes from associated contacts/teams/projects/
                inspections, all in one flat feed (no separate section). */}
            {generalFeed.length > 0 && (
              <div className="space-y-2">
                {topicNotes.length > 0 && (
                  <h3 className="text-[#6a7282] font-['Inter:Medium',sans-serif] text-[12px] uppercase tracking-wider">
                    General
                  </h3>
                )}
                {generalFeed.map(item => item.kind === 'own'
                  ? <NoteCard key={item.note.id} note={item.note} onUpdate={handleUpdate} />
                  : <RollupNoteRow key={item.entry.id} entry={item.entry} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact read-only row for a soft-archived note, with a Restore action for
// whoever's allowed to archive it (creator or assignee).
function ArchivedNoteRow({ note, me, onRestore }: { note: MountainNote; me: ReturnType<typeof useMyContact>; onRestore: () => void }) {
  const canRestore = canCompleteActivity(note, me);
  return (
    <div className="bg-[#f9fafb] rounded-[8px] px-3 py-2.5 opacity-70">
      <p className="text-[13px] text-[#0a0a0a]">{note.text}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-[#8992a0]">
          {note.authorName ? `${note.authorName} · ` : ''}{formatShortDate(note.updatedAt)}
        </p>
        <button
          onClick={() => canRestore && onRestore()}
          disabled={!canRestore}
          title={canRestore ? 'Restore' : 'Only the creator or assignee can restore this'}
          className="p-1 active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArchiveRestore size={13} className="text-[#307fe2]" />
        </button>
      </div>
    </div>
  );
}
