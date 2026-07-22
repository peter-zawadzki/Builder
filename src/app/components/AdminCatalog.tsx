import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import {
  ArrowLeft, Plus, Trash2,
  DollarSign, Wrench, Settings, Pencil, Check, X, Lock, Boxes, FileText, ChevronUp, ChevronDown,
} from 'lucide-react';
import { InventoryTab } from './InventoryTab';
import { toast } from 'sonner';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { useIsSuperAdmin } from '../hooks/useRole';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_EQUIPMENT_ITEMS = [
  'Camera', 'Battery Box', 'POE Switch', 'POE Extender',
  'Wireless RX', 'Wireless TX', 'Existing 120V', 'Existing 480V',
  'Transformer Required', 'Existing Data Drop', 'Existing Fiber Drop',
  'Passive POE Adapter', 'Ethernet Cable 50Ft', 'Antenna Mount',
];


// ─── PriceInput ───────────────────────────────────────────────────────────────

function PriceInput({
  name,
  price,
  onSave,
}: {
  name: string;
  price: number | undefined;
  onSave: (price: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(price !== undefined ? String(price) : '');

  const handleSave = () => {
    const parsed = parseFloat(val);
    if (val.trim() === '') {
      onSave(null);
    } else if (!isNaN(parsed) && parsed >= 0) {
      onSave(parsed);
    } else {
      toast.error('Enter a valid price');
      return;
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[#6a7282]">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="w-24 bg-[#f3f3f5] rounded-[6px] px-2 py-1.5 text-[#0a0a0a] text-[13px] border border-[#307fe2]"
          placeholder="0.00"
        />
        <button onClick={handleSave} className="text-[11px] text-white bg-[#307fe2] px-2 py-1.5 rounded-[6px] font-['Inter:Medium',sans-serif] active:opacity-70">Save</button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-[#6a7282] bg-[#f3f3f5] px-2 py-1.5 rounded-[6px] font-['Inter:Regular',sans-serif] active:opacity-70">Cancel</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setVal(price !== undefined ? String(price) : ''); setEditing(true); }}
      className="flex items-center gap-1 text-[13px] active:opacity-70"
    >
      {price !== undefined ? (
        <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">
          ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ) : (
        <span className="text-[#307fe2] font-['Inter:Regular',sans-serif]">Set price</span>
      )}
      <DollarSign size={12} className={price !== undefined ? 'text-[#6a7282]' : 'text-[#307fe2]'} />
    </button>
  );
}

// ─── Inline edit row helpers ──────────────────────────────────────────────────

function EditableRow({
  name,
  icon,
  badge,
  canEdit,
  canDelete,
  price,
  showPrice,
  onSaveEdit,
  onDelete,
  onSavePrice,
}: {
  name: string;
  icon: React.ReactNode;
  badge?: string;
  canEdit: boolean;
  canDelete: boolean;
  price?: number;
  showPrice: boolean;
  onSaveEdit: (newName: string) => void;
  onDelete: () => void;
  onSavePrice?: (p: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(name);

  const handleSave = () => {
    const trimmed = editVal.trim();
    if (!trimmed) { setEditing(false); return; }
    onSaveEdit(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <input
          type="text"
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="flex-1 bg-[#f3f3f5] rounded-[6px] px-2 py-1.5 text-[#0a0a0a] text-[14px] border border-[#307fe2]"
        />
        <button onClick={handleSave} className="p-1.5 rounded-[6px] bg-[#eef3fb] active:bg-[#dce8f4]">
          <Check size={14} className="text-[#307fe2]" />
        </button>
        <button onClick={() => setEditing(false)} className="p-1.5 rounded-[6px] bg-[#f3f3f5] active:bg-[#e5e7eb]">
          <X size={14} className="text-[#6a7282]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 gap-2">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {icon}
        <div className="min-w-0">
          <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px] truncate">{name}</p>
          {badge && <span className="text-[#6a7282] text-[11px] font-['Inter:Regular',sans-serif]">{badge}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showPrice && onSavePrice && (
          <PriceInput name={name} price={price} onSave={onSavePrice} />
        )}
        {canEdit && (
          <button
            onClick={() => { setEditVal(name); setEditing(true); }}
            className="p-1.5 rounded-[6px] bg-[#eef3fb] active:bg-[#dce8f4]"
          >
            <Pencil size={13} className="text-[#307fe2]" />
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={!canDelete}
          className="p-1.5 rounded-[6px] bg-[#fff0ee] active:bg-[#ffe0da] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 size={14} className="text-[#ff5c39]" />
        </button>
      </div>
    </div>
  );
}

// ─── Equipment Items Tab (Inspection) ────────────────────────────────────────

function EquipmentItemsTab() {
  const { getOptions, addOption, deleteOption } = useData();
  const customItems = getOptions('equipment:items');
  const hiddenBuiltIns = getOptions('equipment:hiddenBuiltIns');

  // Built-ins minus any that have been hidden/deleted
  const visibleBuiltIns = BASE_EQUIPMENT_ITEMS.filter(i => !hiddenBuiltIns.includes(i));
  const allItems = [...new Set([...visibleBuiltIns, ...customItems])].sort((a, b) => a.localeCompare(b));

  const [newItem, setNewItem] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteItem, setDeleteItem] = useState<string | null>(null);

  const handleAddItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (allItems.includes(trimmed)) { toast.error('Item already exists'); return; }
    addOption('equipment:items', trimmed);
    setNewItem('');
    setShowAdd(false);
    toast.success(`"${trimmed}" added`);
  };

  const handleDelete = (item: string) => {
    setDeleteItem(null);
    if (BASE_EQUIPMENT_ITEMS.includes(item)) {
      // Hide the built-in instead of deleting from constants
      addOption('equipment:hiddenBuiltIns', item);
    } else {
      deleteOption('equipment:items', item);
    }
    toast.success(`"${item}" removed`);
  };

  const handleRename = (oldName: string, newName: string) => {
    if (allItems.includes(newName)) { toast.error('An item with that name already exists'); return; }
    if (BASE_EQUIPMENT_ITEMS.includes(oldName)) {
      // Hide the original built-in, add renamed as custom
      addOption('equipment:hiddenBuiltIns', oldName);
      addOption('equipment:items', newName);
    } else {
      deleteOption('equipment:items', oldName);
      addOption('equipment:items', newName);
    }
    toast.success(`Renamed to "${newName}"`);
  };

  const handleRestoreDefaults = () => {
    hiddenBuiltIns.forEach(i => deleteOption('equipment:hiddenBuiltIns', i));
    toast.success('Built-in items restored');
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#eef3fb] rounded-[8px] px-3 py-2.5">
        <p className="text-[#307fe2] font-['Inter:Regular',sans-serif] text-[13px]">
          Manage inspection equipment items. All items — including built-ins — can be renamed or deleted.
          {hiddenBuiltIns.length > 0 && (
            <> {' '}<button onClick={handleRestoreDefaults} className="underline font-['Inter:Medium',sans-serif] active:opacity-70">
              Restore {hiddenBuiltIns.length} removed default{hiddenBuiltIns.length !== 1 ? 's' : ''}
            </button>.</>
          )}
        </p>
      </div>

      <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] divide-y divide-[rgba(0,0,0,0.06)]">
        {allItems.map(item => {
          const isBuiltIn = BASE_EQUIPMENT_ITEMS.includes(item);
          return (
            <EditableRow
              key={item}
              name={item}
              icon={<Wrench size={15} className="text-[#6a7282] shrink-0" />}
              badge={isBuiltIn ? 'Built-in' : undefined}
              canEdit
              canDelete
              showPrice={false}
              onSaveEdit={newName => handleRename(item, newName)}
              onDelete={() => setDeleteItem(item)}
            />
          );
        })}
      </div>

      {/* Delete confirmation */}
      {deleteItem && (
        <DeleteConfirmModal
          title="Remove equipment item?"
          description={
            <>
              This will remove{' '}
              <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                {deleteItem}
              </span>{' '}
              from the inspection equipment list.
            </>
          }
          onConfirm={() => handleDelete(deleteItem)}
          onCancel={() => setDeleteItem(null)}
        />
      )}

      {showAdd ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); if (e.key === 'Escape') setShowAdd(false); }}
            autoFocus
            placeholder="Equipment item name"
            className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif]"
          />
          <button onClick={handleAddItem} className="px-4 py-3 bg-[#307fe2] text-white rounded-[8px] font-['Inter:Medium',sans-serif] active:opacity-70 whitespace-nowrap">Add</button>
          <button onClick={() => setShowAdd(false)} className="px-4 py-3 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] font-['Inter:Regular',sans-serif] active:opacity-70">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[rgba(0,0,0,0.12)] rounded-[10px] py-3 text-[#6a7282] font-['Inter:Medium',sans-serif] text-[14px] active:border-[#307fe2] active:text-[#307fe2] transition-colors"
        >
          <Plus size={16} />
          Add Equipment Item
        </button>
      )}
    </div>
  );
}

// ─── Pages ────────────────────────────────────────────────────────────────────

function PageHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1 active:opacity-60">
          <ArrowLeft size={24} className="text-[#0a0a0a]" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          {icon}
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">{title}</h1>
        </div>
      </div>
    </div>
  );
}

// Inventory — available to all signed-in users.
export function InventoryPage() {
  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="p-4 pb-16">
        <InventoryTab />
      </div>
    </div>
  );
}

// Inspection items catalog — super-admin only (lives under the profile menu).
export function InspectionItemsPage() {
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#f3f3f5] flex items-center justify-center">
          <Lock size={24} className="text-[#6a7282]" />
        </div>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Not available</h1>
          <p className="text-[#6a7282] text-[14px] mt-1">Inspection items are restricted to super admins.</p>
        </div>
        <button onClick={() => navigate('/')} className="bg-[#1D2930] text-white rounded-[8px] px-5 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px]">Back to app</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <PageHeader icon={<Wrench size={20} className="text-[#307fe2]" />} title="Inspection Items" />
      <div className="p-4 pb-16">
        <EquipmentItemsTab />
      </div>
    </div>
  );
}

// Default proposal terms — super-admin only. Seeds every NEW proposal's own
// editable terms list; already-created proposals keep their own copy, so
// editing here is safe and never silently rewrites a signed/sent proposal.
export function ProposalTermsPage() {
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();
  const { proposalTerms, updateProposalTerms } = useData();
  const [terms, setTerms] = useState(proposalTerms);

  useEffect(() => { setTerms(proposalTerms); }, [proposalTerms]);

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#f3f3f5] flex items-center justify-center">
          <Lock size={24} className="text-[#6a7282]" />
        </div>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Not available</h1>
          <p className="text-[#6a7282] text-[14px] mt-1">Proposal terms are restricted to super admins.</p>
        </div>
        <button onClick={() => navigate('/')} className="bg-[#1D2930] text-white rounded-[8px] px-5 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px]">Back to app</button>
      </div>
    );
  }

  const commit = (next: string[]) => { setTerms(next); updateProposalTerms(next); };
  const setTerm = (i: number, v: string) => commit(terms.map((t, idx) => idx === i ? v : t));
  const addTerm = () => commit([...terms, '']);
  const removeTerm = (i: number) => commit(terms.filter((_, idx) => idx !== i));
  const moveTerm = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= terms.length) return;
    const next = [...terms];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <PageHeader icon={<FileText size={20} className="text-[#307fe2]" />} title="Proposal Terms" />
      <div className="p-4 pb-16 max-w-2xl mx-auto space-y-3">
        <p className="text-[13px] text-[#6a7282]">
          These are the default terms seeded onto every new proposal (Section 7). Editing them here does not
          change any proposal that already exists — each proposal gets its own editable copy the moment it's created.
        </p>
        {terms.map((term, i) => (
          <div key={i} className="flex items-start gap-2 bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-3">
            <span className="text-[#9ca3af] text-[13px] mt-2.5 w-4 shrink-0 text-right">{i + 1}.</span>
            <textarea
              value={term}
              onChange={e => setTerm(i, e.target.value)}
              rows={2}
              className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[#0a0a0a] text-[13px] outline-none resize-y"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => moveTerm(i, -1)} disabled={i === 0} className="p-1 rounded-[6px] bg-[#f3f3f5] text-[#6a7282] disabled:opacity-30 active:opacity-70">
                <ChevronUp size={13} />
              </button>
              <button onClick={() => moveTerm(i, 1)} disabled={i === terms.length - 1} className="p-1 rounded-[6px] bg-[#f3f3f5] text-[#6a7282] disabled:opacity-30 active:opacity-70">
                <ChevronDown size={13} />
              </button>
              <button onClick={() => removeTerm(i)} className="p-1 rounded-[6px] bg-[#fff0ee] text-[#ff5c39] active:opacity-70">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addTerm}
          className="w-full border border-dashed border-[#ff5c39] text-[#ff5c39] rounded-[8px] py-2.5 text-[13px] font-['Inter:Medium',sans-serif] flex items-center justify-center gap-2 active:bg-[#fff3f0]"
        >
          <Plus size={14} /> Add Term
        </button>
        <p className="text-[11px] text-[#9ca3af]">
          Use <code>{'{{termYears}}'}</code> / <code>{'{{termYearsWord}}'}</code> in a term to reference each
          proposal's own Contract Term field.
        </p>
      </div>
    </div>
  );
}