
import { useAppMode } from '../../lib/app-mode-context';

export function ModeToggle() {
  const { mode, setMode } = useAppMode();
  const isLive = mode === 'live';

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-gray-200)' }}>
      <div
        role="radiogroup"
        aria-label="App mode"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'var(--color-gray-100)',
          border: '1px solid var(--color-gray-300)',
          height: 32,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: isLive ? 2 : '50%',
            width: 'calc(50% - 4px)',
            background: 'var(--color-dark)',
            transition: 'left 150ms ease',
          }}
        />
        <button
          type="button"
          role="radio"
          aria-checked={isLive}
          onClick={() => setMode('live')}
          className="ds-mono"
          style={{
            position: 'relative',
            zIndex: 1,
            background: 'transparent',
            border: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: isLive ? 'var(--color-white)' : 'var(--color-gray-600)',
            cursor: 'pointer',
          }}
        >
          LIVE
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!isLive}
          onClick={() => setMode('model')}
          className="ds-mono"
          style={{
            position: 'relative',
            zIndex: 1,
            background: 'transparent',
            border: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: !isLive ? 'var(--color-white)' : 'var(--color-gray-600)',
            cursor: 'pointer',
          }}
        >
          MODEL
        </button>
      </div>
    </div>
  );
}
