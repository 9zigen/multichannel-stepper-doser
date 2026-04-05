import { Layout } from '@/Layout';
import routes from '@/routes';
import { useEffect } from 'react';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RealtimeProvider } from '@/components/realtime-provider.tsx';

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

  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <TooltipProvider>
        <RealtimeProvider>
          <Layout>{routes}</Layout>
        </RealtimeProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
};

export default App;
