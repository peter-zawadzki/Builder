
import { useScenario } from '../../lib/scenario-context';
import type { CalendarMonthIndex } from '../../engine/types';

export function OverrideDrawer({ onClose }: { onClose: () => void }) {
  const scenario = useScenario();

  return (
    <div
      role="dialog"
      aria-label="Active overrides"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'var(--color-dark-20)' }}
        aria-hidden
      />
      <div
        style={{
          position: 'relative',
          width: 420,
          maxWidth: '100%',
          background: 'var(--color-white)',
          height: '100%',
          boxShadow: 'var(--shadow-hard-lg)',
          padding: 24,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 24 }}>Overrides</h3>
          <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        {scenario.overrideEntries.length === 0 ? (
          <p className="ds-body">No active overrides. This scenario matches the imported baseline exactly.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenario.overrideEntries.map((entry) => (
              <div
                key={entry.key}
                className="ds-card"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.label}</div>
                  <div className="ds-caption">{entry.page}</div>
                </div>
                <button
                  type="button"
                  className="ds-btn ds-btn--ghost ds-btn--sm"
                  onClick={() => {
                    if (entry.key.startsWith('staff:')) {
                      scenario.resetStaffRole(entry.key.replace('staff:', ''));
                    } else if (entry.key.startsWith('contractor:')) {
                      scenario.setContractorOverride(entry.key.replace('contractor:', ''), {
                        annualAmount: undefined,
                        monthlySchedule: undefined,
                      });
                    } else if (entry.key.startsWith('ga:')) {
                      scenario.setGaOverride(entry.key.replace('ga:', ''), {
                        annualAmount: undefined,
                        allocationCurve: undefined,
                      });
                    } else if (entry.key.startsWith('capitalRaise:')) {
                      const month = Number(entry.key.replace('capitalRaise:', '')) as CalendarMonthIndex;
                      scenario.setCapitalRaiseEvent(month, 0);
                    } else {
                      scenario.resetControl(entry.key);
                    }
                  }}
                >
                  Reset
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
