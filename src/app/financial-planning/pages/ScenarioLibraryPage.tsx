
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useScenario } from '../lib/scenario-context';
import { formatCurrency, formatCount } from '../lib/format';
import type { ScenarioOverrides } from '../engine/types';
import { getAuthToken } from '../../context/DataContext';

async function authedFetch(url: string, init: RequestInit = {}) {
  const token = await getAuthToken();
  return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token ?? ''}` } });
}

interface ScenarioRow {
  id: string;
  name: string;
  comments: string | null;
  createdAt: string;
  overrideCount: number;
  fy2930Revenue: number | null;
  fy2930Resorts: number | null;
}

export default function ScenarioLibraryPage() {
  const navigate = useNavigate();
  const scenario = useScenario();
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function loadScenario(id: string, name: string) {
    if (scenario.isModified && !window.confirm(`Load "${name}"? This replaces every current override.`)) {
      return;
    }
    setLoadingId(id);
    setError(null);
    try {
      const res = await authedFetch(`/api/scenarios/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load scenario.');
      scenario.loadOverrides((data.scenario.overrides ?? {}) as ScenarioOverrides, data.scenario.name);
      navigate('/financial-planning/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load scenario.');
    } finally {
      setLoadingId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    authedFetch('/api/scenarios')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error('Could not load saved scenarios.');
        const data = await res.json();
        if (!cancelled) setScenarios(data.scenarios);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load saved scenarios.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Scenario Library</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        Scenarios saved from the header&rsquo;s &ldquo;Save Scenario&rdquo; button, with who saved each one and its
        headline FY29/30 outcome.
      </p>

      {error && (
        <p className="ds-caption" style={{ color: 'var(--color-functional-red)', marginBottom: 16 }}>
          {error}
        </p>
      )}

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={headCell('left')}>Name</th>
              <th style={headCell('left')}>Date</th>
              <th style={headCell('left')}>Comments</th>
              <th style={headCell('right')}>Overrides</th>
              <th style={headCell('right')}>FY29/30 Revenue</th>
              <th style={headCell('right')}>FY29/30 Resorts</th>
              <th style={headCell('right')}></th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                <td style={{ ...cell, fontWeight: 600 }}>{s.name}</td>
                <td style={cell}>{new Date(s.createdAt).toLocaleString()}</td>
                <td style={{ ...cell, maxWidth: 280 }}>{s.comments || <span className="ds-caption">—</span>}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{s.overrideCount}</td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {s.fy2930Revenue === null ? '—' : formatCurrency(s.fy2930Revenue)}
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {s.fy2930Resorts === null ? '—' : formatCount(s.fy2930Resorts)}
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  <button
                    type="button"
                    className="ds-btn ds-btn--outline ds-btn--sm"
                    onClick={() => loadScenario(s.id, s.name)}
                    disabled={loadingId === s.id}
                  >
                    {loadingId === s.id ? 'Loading…' : 'Load'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && scenarios.length === 0 && (
              <tr>
                <td style={cell} colSpan={8}>
                  No scenarios saved yet — use &ldquo;Save Scenario&rdquo; in the header to save the current one.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td style={cell} colSpan={8}>
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function headCell(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 16px',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    color: 'var(--color-gray-600)',
    whiteSpace: 'nowrap',
  };
}

const cell: React.CSSProperties = { padding: '10px 16px' };
