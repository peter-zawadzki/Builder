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
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-gray-200)' }}>
        <img src="/financial-planning/brand/yullr_logo_wide_text_orange.webp" alt="YULLR" width={160} height={43} />
      </div>
      <ModeToggle />
      <div style={{ overflowY: 'auto', flex: 1, padding: '12px 0' }}>
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
                padding: '10px 20px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: active ? 700 : 400,
                color: active ? 'var(--color-primary-orange)' : 'var(--color-gray-800)',
                borderLeft: active ? '3px solid var(--color-primary-orange)' : '3px solid transparent',
                background: active ? 'var(--color-stroke-orange)' : 'transparent',
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
