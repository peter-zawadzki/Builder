
import { useAppMode } from '../../lib/app-mode-context';
import { Header } from './Header';
import { LivePlaceholder } from './LivePlaceholder';

export function AppShellBody({ children }: { children: React.ReactNode }) {
  const { mode } = useAppMode();
  const isLive = mode === 'live';

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {!isLive && <Header />}
      <main style={{ flex: 1, padding: isLive ? 0 : 24 }}>{isLive ? <LivePlaceholder /> : children}</main>
    </div>
  );
}
