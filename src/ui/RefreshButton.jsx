import { RefreshCw } from 'lucide-react';
import { Button } from './Button';

/**
 * The one Refresh button of the app: blue "refresh" variant, icon + "Refresh" text on every screen size.
 * While `loading` the icon becomes a spinner and the button is disabled. Extra props (aria-label, title…) pass through.
 */
export function RefreshButton({ onClick, loading = false, disabled, children = 'Refresh', ...rest }) {
  return (
    <Button
      variant="refresh"
      icon={RefreshCw}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </Button>
  );
}
