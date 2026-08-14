// Properties panel for a map "connection" (Wireless Link / Wired PoE Link /
// 120V power run) — trimmed sibling of LocationPropertiesPanel.tsx for the
// mountain_connections entity (server/routes/mountainConnections.ts), which
// is deliberately NOT a Location: no photos/videos, no device sub-properties,
// no inspection history. Shared by SiteAssessmentWorkspace (editable) the
// same way LocationPropertiesPanel is.
import { useEffect, useState } from 'react';
import { X, Trash2, Pencil, Lock, Unlock, Radio, Cable, Zap } from 'lucide-react';
import { type MountainConnection, type ConnectionType } from '../utils/mountainConnectionsApi';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

export const CONNECTION_TYPE_CONFIG: Record<ConnectionType, { label: string; color: string; Icon: typeof Radio }> = {
  wireless: { label: 'Wireless Link', color: '#0ea5e9', Icon: Radio },
  poe: { label: 'Wired PoE Link', color: '#22c55e', Icon: Cable },
  '120v': { label: '120V', color: '#f59e0b', Icon: Zap },
};

export function ConnectionPropertiesPanel({
  connection, defaultEditing, onUpdate, onDelete, onClose, onEditingChange,
}: {
  connection: MountainConnection;
  defaultEditing?: boolean;
  onUpdate: (data: Partial<MountainConnection>) => void;
  onDelete: () => void;
  onClose: () => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditingState] = useState(!!defaultEditing);
  const [name, setName] = useState(connection.name);

  function setEditing(value: boolean) {
    setEditingState(value);
    onEditingChange?.(value);
  }

  useEffect(() => { onEditingChange?.(editing); }, []);

  const debouncedUpdate = useDebouncedCallback((data: Partial<MountainConnection>) => onUpdate(data), 500);
  const config = CONNECTION_TYPE_CONFIG[connection.connection_type];

  return (
    <div className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-x-auto sm:left-auto sm:top-4 sm:right-4 sm:bottom-4 z-20 sm:z-10 w-full sm:w-72 max-h-[70vh] sm:max-h-none bg-white rounded-t-[16px] sm:rounded-[12px] shadow-[0_-4px_24px_rgba(0,0,0,0.18)] sm:shadow-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.08)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: config.color }} />
          <span className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif]">{config.label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {editing ? (
            <button
              onClick={() => setEditing(false)}
              className="px-2.5 py-1 rounded-full bg-[#ff5c39] text-white text-[11px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
            >
              Apply
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="p-1 active:opacity-60" title="Edit">
              <Pencil size={15} className="text-[#6a7282]" />
            </button>
          )}
          <button onClick={onClose} className="p-1 active:opacity-60"><X size={16} className="text-[#6a7282]" /></button>
        </div>
      </div>

      {editing ? (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Name</label>
              <input
                type="text" value={name}
                onChange={e => { setName(e.target.value); debouncedUpdate({ name: e.target.value }); }}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
              />
            </div>

            <div>
              <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Type</label>
              <div className="flex gap-1.5">
                {(Object.keys(CONNECTION_TYPE_CONFIG) as ConnectionType[]).map(type => {
                  const typeConfig = CONNECTION_TYPE_CONFIG[type];
                  const active = connection.connection_type === type;
                  return (
                    <button
                      key={type} type="button"
                      onClick={() => onUpdate({ connection_type: type })}
                      className="flex-1 flex flex-col items-center gap-1 py-2 rounded-[8px] text-[11px] font-['Inter:Medium',sans-serif]"
                      style={{ background: active ? typeConfig.color : '#f3f3f5', color: active ? 'white' : '#6a7282' }}
                    >
                      <typeConfig.Icon size={14} />
                      {typeConfig.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Same Install Difficulty control as LocationPropertiesPanel — see that
                file's identical block for the pattern this copies verbatim. */}
            <div>
              <label className="block text-[#6a7282] font-['Inter:Medium',sans-serif] text-[12px] mb-2 uppercase tracking-wider">Install Difficulty</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n} type="button"
                    onClick={() => onUpdate({ difficulty: connection.difficulty === n ? undefined : n })}
                    className={`flex-1 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${
                      connection.difficulty === n ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#8992a0] mt-1.5">1 = easy · 5 = hard</p>
            </div>

            <button
              onClick={() => onUpdate({ is_locked: !connection.is_locked })}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#6a7282] py-2 rounded-[8px] active:opacity-70"
            >
              {connection.is_locked ? <Unlock size={13} /> : <Lock size={13} />}
              {connection.is_locked ? 'Unlock endpoints' : 'Lock endpoints'}
            </button>
          </div>

          <div className="p-3 border-t border-[rgba(0,0,0,0.08)] shrink-0">
            <button
              onClick={onDelete}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] text-[#ef4444] bg-[#fef2f2] py-2 rounded-[8px] active:opacity-70"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">{connection.name}</p>
            {connection.is_locked && (
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-[#6a7282]"><Lock size={11} /> Locked</span>
            )}
          </div>
          <div>
            <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px] uppercase tracking-wide">Type</p>
            <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">{config.label}</p>
          </div>
          {connection.difficulty && (
            <div>
              <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px] uppercase tracking-wide">Install Difficulty</p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">{connection.difficulty} / 5</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
