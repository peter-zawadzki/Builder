
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useScenario } from '../lib/scenario-context';
import { baselineResults } from '../lib/baseline-results';
import { baselineModel } from '../data/baseline';
import { ANNUAL_MODEL_ITEMS, MONTHLY_MODEL_ITEMS, ALL_MODEL_ITEMS } from '../data/modelItems';
import { FISCAL_PERIODS } from '../engine/types';
import { formatCurrency, formatCount, formatPercent } from '../lib/format';
import { NAV_ITEMS } from '../lib/nav';

interface Row {
  key: string;
  label: string;
  domain: string;
  classification: string;
  unit: string;
  period: string;
  sourceSheet: string;
  sourceRange: string;
  uiPage: string;
  baselineValue: number | string;
  currentValue: number | string;
  difference: number | null;
}

function formatByUnit(unit: string, value: number): string {
  if (unit === 'currency') return formatCurrency(value);
  if (unit === 'percent') return formatPercent(value);
  if (unit === 'count') return formatCount(value);
  return String(value);
}

function formatPeriodLabel(period: string): string {
  return period === 'scalar' ? 'Constant' : period;
}

export default function ModelExplorerPage() {
  const scenario = useScenario();
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');
  const [classificationFilter, setClassificationFilter] = useState('All');
  const [sheetFilter, setSheetFilter] = useState('All');

  const domains = useMemo(() => ['All', ...Array.from(new Set(ALL_MODEL_ITEMS.map((i) => i.domain))).sort()], []);
  const sheets = useMemo(() => ['All', ...Array.from(new Set(ALL_MODEL_ITEMS.map((i) => i.sourceSheet))).sort()], []);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];

    for (const item of ANNUAL_MODEL_ITEMS) {
      if (item.period === 'scalar') {
        const currentRaw = (
          { ...scenario.overrides.scalars, growthPreset: scenario.overrides.growthPreset, adoptionPreset: scenario.overrides.adoptionPreset } as Record<
            string,
            unknown
          >
        )[item.key];
        const baselineRaw = (baselineModel.assumptions as unknown as Record<string, unknown>)[item.key];
        const current = currentRaw ?? baselineRaw;
        out.push({
          key: item.key,
          label: item.label,
          domain: item.domain,
          classification: item.classification,
          unit: item.unit,
          period: 'scalar',
          sourceSheet: item.sourceSheet,
          sourceRange: item.sourceRange,
          uiPage: item.uiPage,
          baselineValue: typeof baselineRaw === 'number' ? formatByUnit(item.unit, baselineRaw) : String(baselineRaw),
          currentValue: typeof current === 'number' ? formatByUnit(item.unit, current) : String(current),
          difference: typeof current === 'number' && typeof baselineRaw === 'number' ? current - baselineRaw : null,
        });
        continue;
      }
      for (const period of FISCAL_PERIODS) {
        const currentValue = (scenario.results.annual.periods[period] as unknown as Record<string, number>)[item.key];
        const baselineValue = (baselineResults.annual.periods[period] as unknown as Record<string, number>)[item.key];
        out.push({
          key: item.key,
          label: item.label,
          domain: item.domain,
          classification: item.classification,
          unit: item.unit,
          period,
          sourceSheet: item.sourceSheet,
          sourceRange: item.sourceRange,
          uiPage: item.uiPage,
          baselineValue: formatByUnit(item.unit, baselineValue),
          currentValue: formatByUnit(item.unit, currentValue),
          difference: currentValue - baselineValue,
        });
      }
    }

    for (const item of MONTHLY_MODEL_ITEMS) {
      const subKey = item.key.replace('monthly.', '');
      scenario.results.monthly.forEach((monthResult, i) => {
        const baselineMonth = baselineResults.monthly[i];
        const currentValue = (monthResult as unknown as Record<string, number>)[subKey];
        const baselineValue = (baselineMonth as unknown as Record<string, number>)[subKey];
        out.push({
          key: item.key,
          label: item.label,
          domain: item.domain,
          classification: item.classification,
          unit: item.unit,
          period: monthResult.label,
          sourceSheet: item.sourceSheet,
          sourceRange: item.sourceRange,
          uiPage: item.uiPage,
          baselineValue: formatByUnit(item.unit, baselineValue),
          currentValue: formatByUnit(item.unit, currentValue),
          difference: currentValue - baselineValue,
        });
      });
    }

    return out;
  }, [scenario.results, scenario.overrides]);

  const filtered = rows.filter((r) => {
    if (domainFilter !== 'All' && r.domain !== domainFilter) return false;
    if (classificationFilter !== 'All' && r.classification !== classificationFilter) return false;
    if (sheetFilter !== 'All' && r.sourceSheet !== sheetFilter) return false;
    if (search && !`${r.label} ${r.key}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const uiPageHref = (uiPage: string) => NAV_ITEMS.find((n) => n.label === uiPage)?.href ?? '#';

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Model Explorer</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 760 }}>
        Every material item from the source workbook, with baseline value, current scenario value, difference,
        source sheet/range, classification and primary UI destination. {ALL_MODEL_ITEMS.length} tracked engine keys ×
        period = {rows.length} rows.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="ds-input"
          style={{ maxWidth: 260 }}
          placeholder="Search label or key…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select label="Domain" value={domainFilter} onChange={setDomainFilter} options={domains} />
        <Select
          label="Classification"
          value={classificationFilter}
          onChange={setClassificationFilter}
          options={['All', 'input', 'preset', 'schedule', 'calculated']}
        />
        <Select label="Source Sheet" value={sheetFilter} onChange={setSheetFilter} options={sheets} />
      </div>

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto', maxHeight: 640 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--color-white)', zIndex: 1 }}>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              {['Label', 'Period', 'Baseline', 'Current', 'Δ', 'Classification', 'Source Sheet', 'Range', 'UI Page'].map(
                (h) => (
                  <th key={h} style={headStyle}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((r, i) => (
              <tr key={`${r.key}-${r.period}-${i}`} style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                <td style={cellStyle}>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <div className="ds-caption ds-mono">{r.key}</div>
                </td>
                <td style={cellStyle}>{formatPeriodLabel(r.period)}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{r.baselineValue}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: r.difference ? 700 : 400 }}>{r.currentValue}</td>
                <td
                  style={{
                    ...cellStyle,
                    textAlign: 'right',
                    color: r.difference ? 'var(--color-primary-orange)' : 'var(--color-gray-400)',
                  }}
                >
                  {r.difference && Math.abs(r.difference) > 0.005 ? '≠' : '—'}
                </td>
                <td style={cellStyle}>
                  <span className="ds-chip" style={{ fontSize: 10 }}>
                    {r.classification}
                  </span>
                </td>
                <td style={cellStyle}>{r.sourceSheet}</td>
                <td style={cellStyle}>{r.sourceRange}</td>
                <td style={cellStyle}>
                  <Link to={uiPageHref(r.uiPage)} style={{ color: 'var(--color-regular-blue)', fontWeight: 600 }}>
                    {r.uiPage}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <div className="ds-caption" style={{ padding: 12 }}>
            Showing first 500 of {filtered.length} matching rows — narrow filters to see more.
          </div>
        )}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="ds-caption">{label}</span>
      <select className="ds-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 200 }}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

const headStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  color: 'var(--color-gray-600)',
  whiteSpace: 'nowrap',
};
const cellStyle: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' };
