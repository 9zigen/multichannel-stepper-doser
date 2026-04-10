import { Layout } from '@/Layout';
import routes from '@/routes';
import { useEffect } from 'react';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RealtimeProvider } from '@/components/realtime-provider.tsx';
import { PumpRuntimeProvider } from '@/components/pump-runtime-provider.tsx';
import { AUTH_STATE_EVENT, getStoredAuthToken } from '@/lib/auth-storage.ts';

const App = (): React.ReactElement => {
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const loadStatus = useAppStore((state: AppStoreState) => state.loadStatus);
  const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    loadStatus();
    loadSettings();
  }, [isAuthenticated, loadStatus, loadSettings]);

  useEffect(() => {
    const syncAuthenticationState = () => {
      useAppStore.setState((state) => ({
        ...state,
        isAuthenticated: !!getStoredAuthToken(),
        error: null,
      }));
    };

    window.addEventListener(AUTH_STATE_EVENT, syncAuthenticationState as EventListener);
    window.addEventListener('storage', syncAuthenticationState);
    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, syncAuthenticationState as EventListener);
      window.removeEventListener('storage', syncAuthenticationState);
    };
  }, []);

  return (
    <ThemeProvider defaultTheme="light" storageKey="ui-theme">
      <TooltipProvider>
        <RealtimeProvider>
          <PumpRuntimeProvider>
            <Layout>{routes}</Layout>
          </PumpRuntimeProvider>
        </RealtimeProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
};

export default App;
