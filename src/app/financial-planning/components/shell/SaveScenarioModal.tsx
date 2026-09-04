
import { useState } from 'react';
import { useScenario } from '../../lib/scenario-context';
import { ENGINE_VERSION } from '../../engine/index';
import { getAuthToken } from '../../../context/DataContext';

export function SaveScenarioModal({ onClose }: { onClose: () => void }) {
  const scenario = useScenario();
  const [name, setName] = useState(scenario.scenarioName);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Scenario name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          name: name.trim(),
          comments,
          overrides: scenario.overrides,
          overrideCount: scenario.overrideCount,
          annual: scenario.results.annual.periods,
          engineVersion: ENGINE_VERSION,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save scenario.');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save scenario.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="ds-card"
        style={{ padding: 20, width: 420, background: 'var(--color-white)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {saved ? (
          <>
            <div className="ds-label" style={{ marginBottom: 12 }}>
              Scenario Saved
            </div>
            <p className="ds-body" style={{ marginBottom: 16 }}>
              &ldquo;{name.trim()}&rdquo; has been saved to the Scenario Library.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={save}>
            <div className="ds-label" style={{ marginBottom: 12 }}>
              Save Scenario
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="ds-caption" style={{ display: 'block', marginBottom: 6 }}>
                Scenario Name
              </label>
              <input
                type="text"
                className="ds-input"
                style={{ width: '100%' }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="ds-caption" style={{ display: 'block', marginBottom: 6 }}>
                Comments (optional)
              </label>
              <textarea
                className="ds-input"
                style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>
            {error && (
              <p className="ds-caption" style={{ color: 'var(--color-functional-red)', marginBottom: 12 }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="ds-btn ds-btn--primary ds-btn--sm" disabled={saving}>
                {saving ? 'Saving…' : 'Save Scenario'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
