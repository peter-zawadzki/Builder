import { Link, useLocation } from 'react-router';
import { NAV_ITEMS } from '../../lib/nav';
import { ModeToggle } from './ModeToggle';

export function Nav() {
  const { pathname } = useLocation();

  return (
    <nav
      style={{
        width: 'var(--app-nav-width)',
        flexShrink: 0,
        background: 'var(--color-white)',
        borderRight: '1px solid var(--color-gray-200)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '18px 20px 4px', fontWeight: 600, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-gray-600)' }}>
        Financial Planning
      </div>
      <ModeToggle />
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 12px' }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                margin: '2px 0',
                borderRadius: 8,
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--color-primary-orange)' : 'var(--color-gray-800)',
                background: active ? '#fff0ec' : 'transparent',
              }}
            >
              <span>{item.label}</span>
              {item.status === 'stub' && (
                <span className="ds-chip ds-chip--ghost" style={{ fontSize: 10, padding: '2px 6px' }}>
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
