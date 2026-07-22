import { useState, useRef, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Check, ChevronDown, StickyNote } from 'lucide-react';
import { useData, MountainNote, NoteTopic } from '../context/DataContext';
import { DeleteConfirmModal } from './DeleteConfirmModal';

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const TOPICS: NoteTopic[] = ['Demo', 'Site Visit', 'Proposal', 'Install', 'Training'];

interface QuickNotesModalProps {
  mountainId: string;
  onClose: () => void;
}

export function QuickNotesModal({ mountainId, onClose }: QuickNotesModalProps) {
  const { getNotesByMountainId, getMountainById, addNote, updateNote, deleteNote } = useData();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteModalNote, setDeleteModalNote] = useState<MountainNote | null>(null);

  // Form state for new note
  const [newText, setNewText] = useState('');
  const [newTopic, setNewTopic] = useState<NoteTopic | undefined>();
  const [newScheduled, setNewScheduled] = useState(false);
  const [newCompleted, setNewCompleted] = useState(false);
  const [newInstallProgress, setNewInstallProgress] = useState<number | undefined>();

  // Form state for editing
  const [editText, setEditText] = useState('');
  const [editTopic, setEditTopic] = useState<NoteTopic | undefined>();
  const [editScheduled, setEditScheduled] = useState(false);
  const [editCompleted, setEditCompleted] = useState(false);
  const [editInstallProgress, setEditInstallProgress] = useState<number | undefined>();

  const newTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const mountain = getMountainById(mountainId);
  const notes = getNotesByMountainId(mountainId);

  useEffect(() => {
    if (isAdding && newTextareaRef.current) {
      newTextareaRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingId && editTextareaRef.current) {
      editTextareaRef.current.focus();
    }
  }, [editingId]);

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;

    // Check for duplicate topic
    if (newTopic && notes.some(n => n.topic === newTopic)) {
      alert(`A ${newTopic} note already exists. Please edit the existing note instead.`);
      return;
    }

    addNote(
      mountainId,
      trimmed,
      newTopic,
      newTopic && newTopic !== 'Install' ? newScheduled : undefined,
      newTopic && newTopic !== 'Install' ? newCompleted : undefined,
      newTopic === 'Install' ? newInstallProgress : undefined
    );

    setNewText('');
    setNewTopic(undefined);
    setNewScheduled(false);
    setNewCompleted(false);
    setNewInstallProgress(undefined);
    setIsAdding(false);
  };

  const startEdit = (note: MountainNote) => {
    setEditingId(note.id);
    setEditText(note.text);
    setEditTopic(note.topic);
    setEditScheduled(!!note.scheduled);
    setEditCompleted(!!note.completed);
    setEditInstallProgress(note.installProgress);
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || !editingId) return;

    const updates: Partial<MountainNote> = { text: trimmed };
    if (editTopic) {
      // Check for duplicate topic (excluding current note)
      if (notes.some(n => n.id !== editingId && n.topic === editTopic)) {
        alert(`A ${editTopic} note already exists. Please choose a different topic.`);
        return;
      }
      updates.topic = editTopic;
      if (editTopic === 'Install') {
        updates.installProgress = editInstallProgress;
        updates.scheduled = undefined;
        updates.completed = undefined;
      } else {
        updates.scheduled = editScheduled;
        updates.completed = editCompleted;
        updates.installProgress = undefined;
      }
    } else {
      updates.topic = undefined;
      updates.scheduled = undefined;
      updates.completed = undefined;
      updates.installProgress = undefined;
    }

    updateNote(editingId, updates);
    setEditingId(null);
  };

  const topicNotes = notes.filter(n => n.topic);
  const generalNotes = notes.filter(n => !n.topic);
  const availableTopics = TOPICS.filter(t => !notes.some(n => n.topic === t));

  const topicBadgeColor = (note: MountainNote) => {
    if (!note.topic) return '';
    return note.completed
      ? 'bg-[#22c55e] text-white'
      : note.scheduled
      ? 'bg-[#fbbf24] text-white'
      : 'bg-[#e5e7eb] text-[#6a7282]';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-3 flex items-center justify-between rounded-t-[16px]">
          <div className="flex-1 min-w-0">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px] truncate">
              {mountain?.name || 'Notes'}
            </h2>
            <p className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif]">
              {notes.length} note{notes.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-[#f3f3f5] active:bg-[#e8e8ea] flex-shrink-0 ml-3"
          >
            <X size={20} className="text-[#0a0a0a]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Add note button / form */}
          {isAdding ? (
            <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px] p-3">
              {/* Topic selection */}
              <div className="mb-2">
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[12px] mb-1">
                  Topic (optional)
                </label>
                <select
                  value={newTopic || ''}
                  onChange={e => {
                    const val = e.target.value as NoteTopic | '';
                    setNewTopic(val || undefined);
                    if (!val) {
                      setNewScheduled(false);
                      setNewCompleted(false);
                    }
                  }}
                  className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-1.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]"
                >
                  <option value="">General Note</option>
                  {availableTopics.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Status controls */}
              {newTopic && newTopic === 'Install' ? (
                <div className="mb-2">
                  <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[12px] mb-1">
                    Install Progress
                  </label>
                  <select
                    value={newInstallProgress ?? ''}
                    onChange={e => setNewInstallProgress(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-1.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]"
                  >
                    <option value="">Not Started</option>
                    <option value="0">Scheduled</option>
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="100">Completed</option>
                  </select>
                </div>
              ) : newTopic ? (
                <div className="flex gap-2 mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newScheduled}
                      onChange={e => setNewScheduled(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#307FE2] text-[#fbbf24] focus:ring-[#307FE2]"
                    />
                    <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">
                      {newTopic === 'Proposal' ? 'Submitted' : 'Scheduled'}
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCompleted}
                      onChange={e => setNewCompleted(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#307FE2] text-[#22c55e] focus:ring-[#307FE2]"
                    />
                    <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">
                      {newTopic === 'Proposal' ? 'Signed' : 'Completed'}
                    </span>
                  </label>
                </div>
              ) : null}

              <textarea
                ref={newTextareaRef}
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="Write your note here…"
                rows={3}
                className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30 placeholder:text-[#9ca3af]"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleAdd}
                  disabled={!newText.trim()}
                  className="flex-1 bg-[#307FE2] text-white rounded-[8px] py-2 flex items-center justify-center gap-1.5 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80 disabled:opacity-40"
                >
                  <Check size={14} />
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewText('');
                    setNewTopic(undefined);
                    setNewScheduled(false);
                    setNewCompleted(false);
                  }}
                  className="flex-1 bg-white border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] rounded-[8px] py-2 flex items-center justify-center gap-1.5 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:bg-[#f3f3f5]"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full bg-[#307FE2] text-white rounded-[8px] px-3 py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80"
            >
              <Plus size={18} />
              Add Note
            </button>
          )}

          {/* Notes list */}
          {notes.length === 0 && !isAdding ? (
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-6 text-center">
              <StickyNote className="mx-auto mb-3 text-[#6a7282]" size={40} />
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">
                No notes yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Topic notes */}
              {topicNotes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[#6a7282] font-['Inter:Medium',sans-serif] text-[11px] uppercase tracking-wider">
                    Sales Process
                  </h3>
                  {topicNotes.map(note => {
                    const isEditing = editingId === note.id;
                    const isExpanded = expandedId === note.id;

                    if (isEditing) {
                      return (
                        <div key={note.id} className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px] p-3">
                          {/* Topic selection */}
                          <div className="mb-2">
                            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[12px] mb-1">
                              Topic (optional)
                            </label>
                            <select
                              value={editTopic || ''}
                              onChange={e => {
                                const val = e.target.value as NoteTopic | '';
                                setEditTopic(val || undefined);
                                if (!val) {
                                  setEditScheduled(false);
                                  setEditCompleted(false);
                                }
                              }}
                              className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-1.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]"
                            >
                              <option value="">General Note</option>
                              {TOPICS.filter(t => !notes.some(n => n.id !== note.id && n.topic === t)).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>

                          {/* Status controls */}
                          {editTopic && editTopic === 'Install' ? (
                            <div className="mb-2">
                              <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[12px] mb-1">
                                Install Progress
                              </label>
                              <select
                                value={editInstallProgress ?? ''}
                                onChange={e => setEditInstallProgress(e.target.value ? Number(e.target.value) : undefined)}
                                className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-1.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]"
                              >
                                <option value="">Not Started</option>
                                <option value="0">Scheduled</option>
                                <option value="25">25%</option>
                                <option value="50">50%</option>
                                <option value="75">75%</option>
                                <option value="100">Completed</option>
                              </select>
                            </div>
                          ) : editTopic ? (
                            <div className="flex gap-2 mb-2">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editScheduled}
                                  onChange={e => setEditScheduled(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-[#307FE2] text-[#fbbf24] focus:ring-[#307FE2]"
                                />
                                <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">
                                  {editTopic === 'Proposal' ? 'Submitted' : 'Scheduled'}
                                </span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editCompleted}
                                  onChange={e => setEditCompleted(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-[#307FE2] text-[#22c55e] focus:ring-[#307FE2]"
                                />
                                <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">
                                  {editTopic === 'Proposal' ? 'Signed' : 'Completed'}
                                </span>
                              </label>
                            </div>
                          ) : null}

                          <textarea
                            ref={editTextareaRef}
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={3}
                            className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30"
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={!editText.trim()}
                              className="flex-1 bg-[#307FE2] text-white rounded-[8px] py-2 flex items-center justify-center gap-1.5 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80 disabled:opacity-40"
                            >
                              <Check size={14} />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex-1 bg-white border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] rounded-[8px] py-2 flex items-center justify-center gap-1.5 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:bg-[#f3f3f5]"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                            <button
                              onClick={() => setDeleteModalNote(note)}
                              className="bg-[#fff0ee] border border-[rgba(255,92,57,0.2)] rounded-[8px] py-2 px-2.5 flex items-center justify-center active:bg-[#ffe0da]"
                              aria-label="Delete note"
                            >
                              <Trash2 size={14} className="text-[#ff5c39]" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={note.id} className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px]">
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer active:bg-[#daeaff] rounded-[10px]"
                          onClick={() => setExpandedId(isExpanded ? null : note.id)}
                        >
                          <ChevronDown
                            size={14}
                            className={`text-[#307FE2] flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                          {note.topic && (
                            <span className={`text-[9px] font-['Inter:Medium',sans-serif] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${topicBadgeColor(note)}`}>
                              {note.topic}
                            </span>
                          )}
                          <span className="flex-1 text-left text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] truncate">
                            {note.text}
                          </span>
                          <span className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[11px] flex-shrink-0">
                            {formatShortDate(note.updatedAt)}
                          </span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              startEdit(note);
                            }}
                            className="p-1 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
                            aria-label="Edit note"
                          >
                            <Pencil size={13} className="text-[#307FE2]" />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-[#C5DEFF]">
                            <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed whitespace-pre-wrap">
                              {note.text}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* General notes */}
              {generalNotes.length > 0 && (
                <div className="space-y-2">
                  {topicNotes.length > 0 && (
                    <h3 className="text-[#6a7282] font-['Inter:Medium',sans-serif] text-[11px] uppercase tracking-wider">
                      General
                    </h3>
                  )}
                  {generalNotes.map(note => {
                    const isEditing = editingId === note.id;
                    const isExpanded = expandedId === note.id;

                    if (isEditing) {
                      return (
                        <div key={note.id} className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px] p-3">
                          {/* Topic selection for general notes being edited */}
                          <div className="mb-2">
                            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[12px] mb-1">
                              Topic (optional)
                            </label>
                            <select
                              value={editTopic || ''}
                              onChange={e => {
                                const val = e.target.value as NoteTopic | '';
                                setEditTopic(val || undefined);
                                if (!val) {
                                  setEditScheduled(false);
                                  setEditCompleted(false);
                                }
                              }}
                              className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-1.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]"
                            >
                              <option value="">General Note</option>
                              {TOPICS.filter(t => !notes.some(n => n.id !== note.id && n.topic === t)).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>

                          {/* Status controls if topic selected */}
                          {editTopic && editTopic === 'Install' ? (
                            <div className="mb-2">
                              <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[12px] mb-1">
                                Install Progress
                              </label>
                              <select
                                value={editInstallProgress ?? ''}
                                onChange={e => setEditInstallProgress(e.target.value ? Number(e.target.value) : undefined)}
                                className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-1.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]"
                              >
                                <option value="">Not Started</option>
                                <option value="0">Scheduled</option>
                                <option value="25">25%</option>
                                <option value="50">50%</option>
                                <option value="75">75%</option>
                                <option value="100">Completed</option>
                              </select>
                            </div>
                          ) : editTopic ? (
                            <div className="flex gap-2 mb-2">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editScheduled}
                                  onChange={e => setEditScheduled(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-[#307FE2] text-[#fbbf24] focus:ring-[#307FE2]"
                                />
                                <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">
                                  {editTopic === 'Proposal' ? 'Submitted' : 'Scheduled'}
                                </span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editCompleted}
                                  onChange={e => setEditCompleted(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-[#307FE2] text-[#22c55e] focus:ring-[#307FE2]"
                                />
                                <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">
                                  {editTopic === 'Proposal' ? 'Signed' : 'Completed'}
                                </span>
                              </label>
                            </div>
                          ) : null}

                          <textarea
                            ref={editTextareaRef}
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={3}
                            className="w-full bg-white border border-[#307FE2] rounded-[8px] px-2 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#307FE2]/30"
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={!editText.trim()}
                              className="flex-1 bg-[#307FE2] text-white rounded-[8px] py-2 flex items-center justify-center gap-1.5 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80 disabled:opacity-40"
                            >
                              <Check size={14} />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex-1 bg-white border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] rounded-[8px] py-2 flex items-center justify-center gap-1.5 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:bg-[#f3f3f5]"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                            <button
                              onClick={() => setDeleteModalNote(note)}
                              className="bg-[#fff0ee] border border-[rgba(255,92,57,0.2)] rounded-[8px] py-2 px-2.5 flex items-center justify-center active:bg-[#ffe0da]"
                              aria-label="Delete note"
                            >
                              <Trash2 size={14} className="text-[#ff5c39]" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={note.id} className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[10px]">
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer active:bg-[#daeaff] rounded-[10px]"
                          onClick={() => setExpandedId(isExpanded ? null : note.id)}
                        >
                          <ChevronDown
                            size={14}
                            className={`text-[#307FE2] flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                          <span className="flex-1 text-left text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] truncate">
                            {note.text}
                          </span>
                          <span className="text-[#5a8fc7] font-['Inter:Regular',sans-serif] text-[11px] flex-shrink-0">
                            {formatShortDate(note.updatedAt)}
                          </span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              startEdit(note);
                            }}
                            className="p-1 rounded-[6px] active:bg-[#C5DEFF] flex-shrink-0"
                            aria-label="Edit note"
                          >
                            <Pencil size={13} className="text-[#307FE2]" />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-[#C5DEFF]">
                            <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed whitespace-pre-wrap">
                              {note.text}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteModalNote && (
        <DeleteConfirmModal
          title={`Delete note?`}
          description={
            <>
              This will permanently delete{' '}
              {deleteModalNote.topic ? (
                <>
                  the{' '}
                  <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                    {deleteModalNote.topic}
                  </span>{' '}
                  note
                </>
              ) : (
                <>
                  the note:{' '}
                  <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                    "{deleteModalNote.text.substring(0, 50)}{deleteModalNote.text.length > 50 ? '...' : ''}"
                  </span>
                </>
              )}
              . This cannot be undone.
            </>
          }
          onConfirm={() => {
            deleteNote(deleteModalNote.id);
            setDeleteModalNote(null);
            setEditingId(null);
          }}
          onCancel={() => setDeleteModalNote(null)}
        />
      )}
    </div>
  );
}
