import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight,
  DollarSign, Tag, Wrench, Settings, Pencil, Check, X, Package, Server as ServerIcon, Wifi,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_EQUIPMENT_ITEMS = [
  'Camera', 'Battery Box', 'POE Switch', 'POE Extender',
  'Wireless RX', 'Wireless TX', 'Existing 120V', 'Existing 480V',
  'Transformer Required', 'Existing Data Drop', 'Existing Fiber Drop',
  'Passive POE Adapter', 'Ethernet Cable 50Ft', 'Antenna Mount',
];

// These are the base Miscellaneous install items (seeded into misc:installItems on first admin visit)
const BASE_MISC_ITEMS = [
  'Ethernet Cable 50ft',
  'Antenna Mount',
  'POE Injector',
  'Passive POE Adapter',
  'Waterproof Enclosure',
  'Battery Box',
  'GRK 3 Inch',
  'GRK 2 Inch',
  'Spacers',
];

const BASE_NETWORK_CATEGORIES = [
  'Firewall',
  'NVR',
  'POE Extender',
  'POE Switch',
  'Passive POE Adapter',
  'Router',
  'WiFi Access Point',
  'Wireless Bridge RX',
  'Wireless Bridge TX',
];

const ASSET_CATEGORIES = [
  { label: 'Camera', key: 'camera' },
  { label: 'Network Gear', key: 'network' },
];

const SERVER_COMPONENT_CATEGORIES = [
  { label: 'Processors', key: 'server:processors' },
  { label: 'GPUs', key: 'server:gpus' },
  { label: 'RAM Configurations', key: 'server:ram' },
  { label: 'Motherboards', key: 'server:motherboards' },
  { label: 'OS Disks', key: 'server:os_disks' },
  { label: 'Capture Disks', key: 'server:capture_disks' },
  { label: 'Archive Disks', key: 'server:archive_disks' },
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
  const allItems = [...new Set([...BASE_EQUIPMENT_ITEMS, ...customItems])].sort((a, b) => a.localeCompare(b));

  const [newItem, setNewItem] = useState('');
  const [showAdd, setShowAdd] = useState(false);

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
    if (BASE_EQUIPMENT_ITEMS.includes(item)) { toast.error('Cannot delete a built-in equipment item'); return; }
    deleteOption('equipment:items', item);
    toast.success(`"${item}" removed`);
  };

  const handleRename = (oldName: string, newName: string) => {
    if (BASE_EQUIPMENT_ITEMS.includes(oldName)) { toast.error('Cannot rename a built-in equipment item'); return; }
    if (allItems.includes(newName)) { toast.error('An item with that name already exists'); return; }
    deleteOption('equipment:items', oldName);
    addOption('equipment:items', newName);
    toast.success(`Renamed to "${newName}"`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#eef3fb] rounded-[8px] px-3 py-2.5">
        <p className="text-[#307fe2] font-['Inter:Regular',sans-serif] text-[13px]">
          Manage inspection equipment items. Built-in items cannot be renamed or deleted.
          Custom items support full edit and delete.
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
              canEdit={!isBuiltIn}
              canDelete={!isBuiltIn}
              showPrice={false}
              onSaveEdit={newName => handleRename(item, newName)}
              onDelete={() => handleDelete(item)}
            />
          );
        })}
      </div>

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

// ─── Install Items Tab (Miscellaneous) ───────────────────────────────────────

function InstallItemsTab() {
  const { getOptions, addOption, deleteOption, itemPrices, setItemPrice } = useData();
  const items = getOptions('misc:installItems');

  // Seed base items on first visit
  useEffect(() => {
    if (items.length === 0) {
      BASE_MISC_ITEMS.forEach(item => addOption('misc:installItems', item));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [newItem, setNewItem] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const handleAddItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (items.includes(trimmed)) { toast.error('Item already exists'); return; }
    addOption('misc:installItems', trimmed);
    setNewItem('');
    setShowAdd(false);
    toast.success(`"${trimmed}" added`);
  };

  const handleDelete = (item: string) => {
    deleteOption('misc:installItems', item);
    toast.success(`"${item}" removed`);
  };

  const handleRename = (oldName: string, newName: string) => {
    if (items.includes(newName)) { toast.error('An item with that name already exists'); return; }
    const oldPrice = itemPrices[oldName];
    deleteOption('misc:installItems', oldName);
    addOption('misc:installItems', newName);
    if (oldPrice !== undefined) {
      setItemPrice(newName, oldPrice);
      setItemPrice(oldName, null);
    }
    toast.success(`Renamed to "${newName}"`);
  };

  const sortedItems = [...items].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div className="bg-[#eef3fb] rounded-[8px] px-3 py-2.5">
        <p className="text-[#307fe2] font-['Inter:Regular',sans-serif] text-[13px]">
          Manage Miscellaneous install items with unit prices. These are the items shown when adding a
          Miscellaneous asset in the field. Prices appear in PDF and CSV reports.
        </p>
      </div>

      <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] divide-y divide-[rgba(0,0,0,0.06)]">
        {sortedItems.length === 0 && (
          <p className="text-[#6a7282] text-[13px] text-center py-6 font-['Inter:Regular',sans-serif]">No items yet. Add one below.</p>
        )}
        {sortedItems.map(item => (
          <EditableRow
            key={item}
            name={item}
            icon={<Package size={15} className="text-[#6a7282] shrink-0" />}
            canEdit
            canDelete
            showPrice
            price={itemPrices[item]}
            onSavePrice={p => setItemPrice(item, p)}
            onSaveEdit={newName => handleRename(item, newName)}
            onDelete={() => handleDelete(item)}
          />
        ))}
      </div>

      {showAdd ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); if (e.key === 'Escape') setShowAdd(false); }}
            autoFocus
            placeholder="Install item name"
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
          Add Install Item
        </button>
      )}
    </div>
  );
}

// ─── Server Components Tab ────────────────────────────────────────────────────

function ServerComponentCategorySection({ label, optKey }: { label: string; optKey: string }) {
  const { getOptions, addOption, deleteOption, itemPrices, setItemPrice } = useData();
  const items = getOptions(optKey);
  const [expanded, setExpanded] = useState(false);

  const handleRename = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    if (items.includes(newName)) { toast.error('Already exists'); return; }
    const oldPrice = itemPrices[oldName];
    deleteOption(optKey, oldName);
    addOption(optKey, newName);
    if (oldPrice !== undefined) {
      setItemPrice(newName, oldPrice);
      setItemPrice(oldName, null);
    }
    toast.success(`Renamed to "${newName}"`);
  };

  const handleDelete = (name: string) => {
    deleteOption(optKey, name);
    toast.success(`"${name}" removed`);
  };

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 active:bg-[#f9fafb]"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded
          ? <ChevronDown size={16} className="text-[#307fe2] shrink-0" />
          : <ChevronRight size={16} className="text-[#6a7282] shrink-0" />
        }
        <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px] flex-1 text-left">{label}</span>
        <span className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif]">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </button>
      {expanded && (
        <div className="border-t border-[rgba(0,0,0,0.06)] divide-y divide-[rgba(0,0,0,0.06)]">
          {items.map(item => (
            <EditableRow
              key={item}
              name={item}
              icon={<div className="w-1.5 h-1.5 rounded-full bg-[#307fe2] shrink-0" />}
              canEdit
              canDelete
              showPrice
              price={itemPrices[item]}
              onSavePrice={p => setItemPrice(item, p)}
              onSaveEdit={newName => handleRename(item, newName)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServerComponentsTab() {
  const { itemPrices, setItemPrice } = useData();

  // Seed default case prices on first load
  useEffect(() => {
    if (itemPrices['Tower'] === undefined) setItemPrice('Tower', 200);
    if (itemPrices['Rack Mount'] === undefined) setItemPrice('Rack Mount', 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const CASE_ITEMS = [
    { key: 'Tower', label: 'Tower Case', defaultNote: 'Default: $200.00' },
    { key: 'Rack Mount', label: 'Rack Mount Case', defaultNote: 'Default: $300.00' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[#eef3fb] rounded-[8px] px-3 py-2.5">
        <p className="text-[#307fe2] font-['Inter:Regular',sans-serif] text-[13px]">
          Set prices for server cases and components. Case prices default to $200 (Tower) and $300 (Rack Mount).
          Component prices are applied per item in PDF and CSV reports.
          Component options appear after being added via the Server asset form.
        </p>
      </div>

      {/* Case Pricing */}
      <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-3 flex items-center gap-2">
          <ServerIcon size={15} className="text-[#90b4e8]" />
          <h3 className="text-white font-['Inter:Medium',sans-serif] font-medium text-[15px]">Case / Form Factor</h3>
        </div>
        <div className="divide-y divide-[rgba(0,0,0,0.06)]">
          {CASE_ITEMS.map(({ key, label, defaultNote }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px]">{label}</p>
                <p className="text-[#6a7282] text-[11px] font-['Inter:Regular',sans-serif]">{defaultNote}</p>
              </div>
              <PriceInput
                name={key}
                price={itemPrices[key]}
                onSave={p => setItemPrice(key, p)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Component Categories */}
      <div className="bg-[#f9fafb] rounded-[8px] px-3 py-2">
        <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">
          Component options below appear once added via the Server asset form in the field.
        </p>
      </div>

      {SERVER_COMPONENT_CATEGORIES.map(cat => (
        <ServerComponentCategorySection key={cat.key} label={cat.label} optKey={cat.key} />
      ))}

      {SERVER_COMPONENT_CATEGORIES.every(cat => {
        // This is evaluated but we need to use a different approach
        return false;
      }) && (
        <p className="text-[#6a7282] text-[13px] text-center py-4 font-['Inter:Regular',sans-serif]">
          No server component options added yet. Add them via the Server asset form.
        </p>
      )}
    </div>
  );
}

// ─── Manufacturers & Models Tab ───────────────────────────────────────────────

function CategorySection({ categoryLabel, categoryKey }: { categoryLabel: string; categoryKey: string }) {
  const { getOptions, addOption, deleteOption, itemPrices, setItemPrice } = useData();
  const manufacturers = getOptions(`${categoryKey}:manufacturers`);
  const [expandedMfg, setExpandedMfg] = useState<string | null>(null);
  const [newMfg, setNewMfg] = useState('');
  const [showAddMfg, setShowAddMfg] = useState(false);
  const [newModels, setNewModels] = useState<Record<string, string>>({});
  const [showAddModel, setShowAddModel] = useState<Record<string, boolean>>({});
  // Inline rename state
  const [editingMfg, setEditingMfg] = useState<string | null>(null);
  const [editMfgVal, setEditMfgVal] = useState('');
  const [editingModel, setEditingModel] = useState<{ mfg: string; model: string } | null>(null);
  const [editModelVal, setEditModelVal] = useState('');

  const handleAddMfg = () => {
    const trimmed = newMfg.trim();
    if (!trimmed) return;
    if (manufacturers.includes(trimmed)) { toast.error('Manufacturer already exists'); return; }
    addOption(`${categoryKey}:manufacturers`, trimmed);
    setNewMfg('');
    setShowAddMfg(false);
    setExpandedMfg(trimmed);
    toast.success(`"${trimmed}" added`);
  };

  const handleDeleteMfg = (mfg: string) => {
    deleteOption(`${categoryKey}:manufacturers`, mfg);
    const models = getOptions(`${categoryKey}:models:${mfg}`);
    models.forEach(m => deleteOption(`${categoryKey}:models:${mfg}`, m));
    toast.success(`"${mfg}" removed`);
  };

  const handleRenameMfg = (oldMfg: string, newMfg: string) => {
    const trimmed = newMfg.trim();
    if (!trimmed || trimmed === oldMfg) { setEditingMfg(null); return; }
    if (manufacturers.includes(trimmed)) { toast.error('Manufacturer already exists'); return; }
    // Transfer models to new key
    const models = getOptions(`${categoryKey}:models:${oldMfg}`);
    addOption(`${categoryKey}:manufacturers`, trimmed);
    models.forEach(m => {
      addOption(`${categoryKey}:models:${trimmed}`, m);
      deleteOption(`${categoryKey}:models:${oldMfg}`, m);
    });
    deleteOption(`${categoryKey}:manufacturers`, oldMfg);
    if (expandedMfg === oldMfg) setExpandedMfg(trimmed);
    setEditingMfg(null);
    toast.success(`Renamed to "${trimmed}"`);
  };

  const handleAddModel = (mfg: string) => {
    const trimmed = (newModels[mfg] || '').trim();
    if (!trimmed) return;
    const existing = getOptions(`${categoryKey}:models:${mfg}`);
    if (existing.includes(trimmed)) { toast.error('Model already exists'); return; }
    addOption(`${categoryKey}:models:${mfg}`, trimmed);
    setNewModels(prev => ({ ...prev, [mfg]: '' }));
    setShowAddModel(prev => ({ ...prev, [mfg]: false }));
    toast.success(`"${trimmed}" added`);
  };

  const handleDeleteModel = (mfg: string, model: string) => {
    deleteOption(`${categoryKey}:models:${mfg}`, model);
    toast.success(`"${model}" removed`);
  };

  const handleRenameModel = (mfg: string, oldModel: string, newModel: string) => {
    const trimmed = newModel.trim();
    if (!trimmed || trimmed === oldModel) { setEditingModel(null); return; }
    const existing = getOptions(`${categoryKey}:models:${mfg}`);
    if (existing.includes(trimmed)) { toast.error('Model already exists'); return; }
    const oldPrice = itemPrices[oldModel];
    deleteOption(`${categoryKey}:models:${mfg}`, oldModel);
    addOption(`${categoryKey}:models:${mfg}`, trimmed);
    if (oldPrice !== undefined) {
      setItemPrice(trimmed, oldPrice);
      setItemPrice(oldModel, null);
    }
    setEditingModel(null);
    toast.success(`Renamed to "${trimmed}"`);
  };

  return (
    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] overflow-hidden">
      <div className="bg-[#1e3a5f] px-4 py-3 flex items-center gap-2">
        <Tag size={15} className="text-[#90b4e8]" />
        <h3 className="text-white font-['Inter:Medium',sans-serif] font-medium text-[15px]">{categoryLabel}</h3>
        <span className="ml-auto text-[#90b4e8] text-[12px]">{manufacturers.length} manufacturers</span>
      </div>

      <div className="divide-y divide-[rgba(0,0,0,0.06)]">
        {manufacturers.length === 0 && (
          <p className="text-[#6a7282] text-[13px] text-center py-4 font-['Inter:Regular',sans-serif]">No manufacturers yet. Add one below.</p>
        )}
        {manufacturers.map(mfg => {
          const models = getOptions(`${categoryKey}:models:${mfg}`);
          const isExpanded = expandedMfg === mfg;
          return (
            <div key={mfg}>
              {/* Manufacturer rename mode */}
              {editingMfg === mfg ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-[#f9fafb]" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editMfgVal}
                    onChange={e => setEditMfgVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameMfg(mfg, editMfgVal); if (e.key === 'Escape') setEditingMfg(null); }}
                    autoFocus
                    className="flex-1 bg-white border border-[#307fe2] rounded-[6px] px-2 py-1.5 text-[#0a0a0a] text-[14px]"
                  />
                  <button onClick={() => handleRenameMfg(mfg, editMfgVal)} className="p-1.5 rounded-[6px] bg-[#eef3fb] active:bg-[#dce8f4]">
                    <Check size={14} className="text-[#307fe2]" />
                  </button>
                  <button onClick={() => setEditingMfg(null)} className="p-1.5 rounded-[6px] bg-[#f3f3f5] active:bg-[#e5e7eb]">
                    <X size={14} className="text-[#6a7282]" />
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 px-4 py-3 active:bg-[#f9fafb] cursor-pointer"
                  onClick={() => setExpandedMfg(isExpanded ? null : mfg)}
                >
                  {isExpanded
                    ? <ChevronDown size={16} className="text-[#307fe2] shrink-0" />
                    : <ChevronRight size={16} className="text-[#6a7282] shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px]">{mfg}</p>
                    <p className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif]">{models.length} model{models.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setEditMfgVal(mfg); setEditingMfg(mfg); }}
                    className="p-1.5 rounded-[6px] bg-[#eef3fb] active:bg-[#dce8f4] shrink-0"
                  >
                    <Pencil size={13} className="text-[#307fe2]" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteMfg(mfg); }}
                    className="p-1.5 rounded-[6px] bg-[#fff0ee] active:bg-[#ffe0da] shrink-0"
                  >
                    <Trash2 size={13} className="text-[#ff5c39]" />
                  </button>
                </div>
              )}

              {isExpanded && (
                <div className="bg-[#f9fafb] px-4 pb-3">
                  {models.length === 0 && (
                    <p className="text-[#6a7282] text-[12px] py-2 font-['Inter:Regular',sans-serif]">No models yet.</p>
                  )}
                  {models.map(model => {
                    const isEditingThisModel = editingModel?.mfg === mfg && editingModel?.model === model;
                    return (
                      <div key={model} className="border-b border-[rgba(0,0,0,0.05)]">
                        {isEditingThisModel ? (
                          <div className="flex items-center gap-2 py-2">
                            <input
                              type="text"
                              value={editModelVal}
                              onChange={e => setEditModelVal(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleRenameModel(mfg, model, editModelVal); if (e.key === 'Escape') setEditingModel(null); }}
                              autoFocus
                              className="flex-1 bg-white border border-[#307fe2] rounded-[6px] px-2 py-1.5 text-[#0a0a0a] text-[13px]"
                            />
                            <button onClick={() => handleRenameModel(mfg, model, editModelVal)} className="p-1.5 rounded-[5px] bg-[#eef3fb] active:bg-[#dce8f4]">
                              <Check size={12} className="text-[#307fe2]" />
                            </button>
                            <button onClick={() => setEditingModel(null)} className="p-1.5 rounded-[5px] bg-[#f3f3f5] active:bg-[#e5e7eb]">
                              <X size={12} className="text-[#6a7282]" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#307fe2] shrink-0" />
                              <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px] truncate">{model}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <PriceInput name={model} price={itemPrices[model]} onSave={p => setItemPrice(model, p)} />
                              <button
                                onClick={() => { setEditModelVal(model); setEditingModel({ mfg, model }); }}
                                className="p-1 rounded-[5px] bg-[#eef3fb] active:bg-[#dce8f4]"
                              >
                                <Pencil size={11} className="text-[#307fe2]" />
                              </button>
                              <button onClick={() => handleDeleteModel(mfg, model)} className="p-1 rounded-[5px] bg-[#fff0ee] active:bg-[#ffe0da]">
                                <Trash2 size={12} className="text-[#ff5c39]" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {showAddModel[mfg] ? (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={newModels[mfg] || ''}
                        onChange={e => setNewModels(prev => ({ ...prev, [mfg]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddModel(mfg); if (e.key === 'Escape') setShowAddModel(prev => ({ ...prev, [mfg]: false })); }}
                        autoFocus
                        placeholder="Model name"
                        className="flex-1 bg-white border border-[rgba(0,0,0,0.1)] rounded-[6px] px-2 py-2 text-[#0a0a0a] text-[13px]"
                      />
                      <button onClick={() => handleAddModel(mfg)} className="px-3 py-2 bg-[#307fe2] text-white rounded-[6px] text-[12px] font-['Inter:Medium',sans-serif] active:opacity-70">Add</button>
                      <button onClick={() => setShowAddModel(prev => ({ ...prev, [mfg]: false }))} className="px-2 py-2 bg-[#f3f3f5] text-[#6a7282] rounded-[6px] text-[12px] active:opacity-70">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddModel(prev => ({ ...prev, [mfg]: true }))}
                      className="mt-2 flex items-center gap-1.5 text-[#307fe2] text-[12px] font-['Inter:Medium',sans-serif] active:opacity-70"
                    >
                      <Plus size={13} />
                      Add Model
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-[rgba(0,0,0,0.06)]">
        {showAddMfg ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newMfg}
              onChange={e => setNewMfg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddMfg(); if (e.key === 'Escape') setShowAddMfg(false); }}
              autoFocus
              placeholder="Manufacturer name"
              className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px]"
            />
            <button onClick={handleAddMfg} className="px-3 py-2.5 bg-[#307fe2] text-white rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] active:opacity-70">Add</button>
            <button onClick={() => setShowAddMfg(false)} className="px-3 py-2.5 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] text-[13px] active:opacity-70">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddMfg(true)}
            className="flex items-center gap-2 text-[#307fe2] font-['Inter:Medium',sans-serif] text-[13px] active:opacity-70"
          >
            <Plus size={15} />
            Add Manufacturer
          </button>
        )}
      </div>
    </div>
  );
}

function ManufacturersTab() {
  return (
    <div className="space-y-4">
      <div className="bg-[#eef3fb] rounded-[8px] px-3 py-2.5">
        <p className="text-[#307fe2] font-['Inter:Regular',sans-serif] text-[13px]">
          Manage Network Gear categories, and manufacturers &amp; models for Camera and Network Gear.
          Prices set here appear in PDF and CSV reports.
        </p>
      </div>

      {/* Network Categories */}
      <NetworkCategoriesSection />

      {/* Manufacturers & Models */}
      {ASSET_CATEGORIES.map(cat => (
        <CategorySection key={cat.key} categoryLabel={cat.label} categoryKey={cat.key} />
      ))}
    </div>
  );
}

// ─── Network Categories Section ───────────────────────────────────────────────

function NetworkCategoriesSection() {
  const { getOptions, addOption, deleteOption } = useData();
  const customItems = getOptions('network:categories');

  // Seed base categories on first admin visit
  useEffect(() => {
    if (customItems.length === 0) {
      BASE_NETWORK_CATEGORIES.forEach(item => addOption('network:categories', item));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allItems = [...customItems].sort((a, b) => a.localeCompare(b));

  const [newItem, setNewItem] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (allItems.includes(trimmed)) { toast.error('Category already exists'); return; }
    addOption('network:categories', trimmed);
    setNewItem('');
    setShowAdd(false);
    toast.success(`"${trimmed}" added`);
  };

  const handleDelete = (item: string) => {
    deleteOption('network:categories', item);
    toast.success(`"${item}" removed`);
  };

  const handleRename = (oldName: string, newName: string) => {
    if (allItems.includes(newName)) { toast.error('A category with that name already exists'); return; }
    deleteOption('network:categories', oldName);
    addOption('network:categories', newName);
    toast.success(`Renamed to "${newName}"`);
  };

  return (
    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] overflow-hidden">
      <div className="bg-[#1e3a5f] px-4 py-3 flex items-center gap-2">
        <Wifi size={15} className="text-[#90b4e8]" />
        <h3 className="text-white font-['Inter:Medium',sans-serif] font-medium text-[15px]">Network Categories</h3>
        <span className="ml-auto text-[#90b4e8] text-[12px]">{allItems.length} items</span>
      </div>
      <div className="divide-y divide-[rgba(0,0,0,0.06)]">
        {allItems.map(item => (
          <EditableRow
            key={item}
            name={item}
            icon={<div className="w-1.5 h-1.5 rounded-full bg-[#307fe2] shrink-0" />}
            canEdit
            canDelete
            showPrice={false}
            onSaveEdit={newName => handleRename(item, newName)}
            onDelete={() => handleDelete(item)}
          />
        ))}
      </div>
      <div className="px-4 py-3 border-t border-[rgba(0,0,0,0.06)]">
        {showAdd ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
              autoFocus
              placeholder="Category name"
              className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px]"
            />
            <button onClick={handleAdd} className="px-3 py-2.5 bg-[#307fe2] text-white rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] active:opacity-70">Add</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-2.5 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] text-[13px] active:opacity-70">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 text-[#307fe2] font-['Inter:Medium',sans-serif] text-[13px] active:opacity-70"
          >
            <Plus size={15} />
            Add Category
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'equipment' | 'install' | 'server' | 'catalog';

export function AdminCatalog() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('equipment');

  const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'equipment', icon: <Wrench size={13} />, label: 'Inspection' },
    { id: 'install',   icon: <Package size={13} />, label: 'Install' },
    { id: 'server',    icon: <ServerIcon size={13} />, label: 'Server' },
    { id: 'catalog',   icon: <Tag size={13} />, label: 'Catalog' },
  ];

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Settings size={20} className="text-[#307fe2]" />
            <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">Admin Catalog</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-[#f3f3f5] rounded-[8px] p-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 rounded-[6px] py-2 text-[11px] font-['Inter:Medium',sans-serif] transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-[#0a0a0a] shadow-sm'
                  : 'text-[#6a7282]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-16">
        {activeTab === 'equipment' && <EquipmentItemsTab />}
        {activeTab === 'install'   && <InstallItemsTab />}
        {activeTab === 'server'    && <ServerComponentsTab />}
        {activeTab === 'catalog'   && <ManufacturersTab />}
      </div>
    </div>
  );
}