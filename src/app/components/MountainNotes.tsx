import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, StickyNote, ChevronDown } from 'lucide-react';
import { useData, MountainNote } from '../context/DataContext';

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

interface NoteCardProps {
  note: MountainNote;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

function NoteCard({ note, onUpdate, onDelete }: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onUpdate(note.id, trimmed);
    setIsEditing(false);
    setIsExpanded(false);
  };

  const handleCancel = () => {
    setDraft(note.text);
    setIsEditing(false);
  };

  const wasEdited = note.updatedAt !== note.createdAt;

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px] p-4">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          className="w-full bg-white border border-[#307FE2] rounded-[8px] px-3 py-2 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30"
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
            className="flex-1 bg-white border border-[rgba(29,41,48,0.12)] text-[#1D2930] rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#F2F3F5]"
          >
            <X size={16} />
            Cancel
          </button>
          <button
            onClick={() => onDelete(note.id)}
            className="bg-[#FFEDE9] border border-[rgba(249,92,57,0.2)] rounded-[8px] py-2.5 px-3 flex items-center justify-center active:bg-[#FFCFC9]"
            aria-label="Delete note"
          >
            <Trash2 size={16} className="text-[#F95C39]" />
          </button>
        </div>
      </div>
    );
  }

  // ── Expanded view ──────────────────────────────────────────────────────────
  if (isExpanded) {
    return (
      <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px]">
        <div
          className="w-full flex items-center gap-2 px-3 py-3 active:bg-[#daeaff] rounded-t-[10px] transition-colors cursor-pointer"
          onClick={() => setIsExpanded(false)}
        >
          <ChevronDown size={15} className="text-[#307FE2] flex-shrink-0 rotate-180 transition-transform" />
          <span className="flex-1 text-left text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] truncate">
            {note.text}
          </span>
          <span className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[12px] flex-shrink-0">
            {formatShortDate(note.updatedAt)}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setIsEditing(true); }}
            className="p-1.5 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
            aria-label="Edit note"
          >
            <Pencil size={14} className="text-[#307FE2]" />
          </button>
        </div>
        <div className="px-4 pb-4 pt-1 border-t border-[#C5DEFF]">
          <p className="text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] leading-relaxed whitespace-pre-wrap">
            {note.text}
          </p>
          <p className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[12px] mt-3">
            {wasEdited ? 'Edited ' : ''}{formatFullDateTime(note.updatedAt)}
          </p>
        </div>
      </div>
    );
  }

  // ── Collapsed view (default) ───────────────────────────────────────────────
  return (
    <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px]">
      <div
        className="w-full flex items-center gap-2 px-3 py-3 active:bg-[#daeaff] rounded-[10px] transition-colors cursor-pointer"
        onClick={() => setIsExpanded(true)}
      >
        <ChevronDown size={15} className="text-[#307FE2] flex-shrink-0" />
        <span className="flex-1 text-left text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] truncate min-w-0">
          {note.text}
        </span>
        <span className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[12px] flex-shrink-0 ml-1">
          {formatShortDate(note.updatedAt)}
        </span>
        <button
          onClick={e => { e.stopPropagation(); setIsEditing(true); }}
          className="p-1.5 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
          aria-label="Edit note"
        >
          <Pencil size={14} className="text-[#307FE2]" />
        </button>
      </div>
    </div>
  );
}

interface MountainNotesProps {
  mountainId: string;
}

export function MountainNotes({ mountainId }: MountainNotesProps) {
  const { addNote, updateNote, deleteNote, getNotesByMountainId } = useData();
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const newTextareaRef = useRef<HTMLTextAreaElement>(null);

  const notes = getNotesByMountainId(mountainId);

  useEffect(() => {
    if (isAdding && newTextareaRef.current) {
      newTextareaRef.current.focus();
    }
  }, [isAdding]);

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    addNote(mountainId, trimmed);
    setNewText('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewText('');
    setIsAdding(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
          Notes
        </h2>
      </div>

      {/* Add note button / inline form */}
      {isAdding ? (
        <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px] p-4 mb-3">
          <textarea
            ref={newTextareaRef}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Write your note here…"
            rows={4}
            className="w-full bg-white border border-[#307FE2] rounded-[8px] px-3 py-2 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30 placeholder:text-[#9ca3af]"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="flex-1 bg-[#307FE2] text-white rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-40"
            >
              <Check size={16} />
              Add Note
            </button>
            <button
              onClick={handleCancelAdd}
              className="flex-1 bg-white border border-[rgba(29,41,48,0.12)] text-[#1D2930] rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#F2F3F5]"
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full bg-[#307FE2] text-white rounded-[10px] px-4 py-3 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium mb-3 active:opacity-80"
        >
          <Plus size={20} />
          Add Note
        </button>
      )}

      {/* Notes list */}
      {notes.length === 0 && !isAdding ? (
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-8 text-center">
          <StickyNote className="mx-auto mb-4 text-[#6D7B83]" size={48} />
          <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif]">
            No notes yet. Add a note to capture important details.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              onUpdate={updateNote}
              onDelete={deleteNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}