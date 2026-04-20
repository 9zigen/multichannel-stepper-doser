import { Layout } from '@/Layout';
import routes from '@/routes';
import React, { useEffect } from 'react';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { ThemeProvider } from '@/components/theme-provider';
import { FontScaleProvider } from '@/components/font-scale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RealtimeProvider, useRealtimeConnection } from '@/components/realtime-provider.tsx';
import { PumpRuntimeProvider, usePumpRuntime } from '@/components/pump-runtime-provider.tsx';
import { AUTH_STATE_EVENT, getStoredAuthToken } from '@/lib/auth-storage.ts';
import { BACKEND_SYSTEM_READY_EVENT } from '@/lib/device-events.ts';

function DeviceLifecycleBridge(): React.ReactElement | null {
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const firmwareVersion = useAppStore((state: AppStoreState) => state.status.firmware_version);
  const loadStatus = useAppStore((state: AppStoreState) => state.loadStatus);
  const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);
  const { syncRuntime } = usePumpRuntime();
  const { lastMessage } = useRealtimeConnection();

  useEffect(() => {
    if (
      !isAuthenticated ||
      !lastMessage ||
      typeof lastMessage !== 'object' || !('type' in lastMessage) ||
      (lastMessage as { type?: string }).type !== 'system_ready'
    ) {
      return;
    }

    const message = lastMessage as { firmware_version?: string };
    const previousFirmwareVersion = firmwareVersion;

    window.dispatchEvent(new CustomEvent(BACKEND_SYSTEM_READY_EVENT, { detail: message }));

    void (async () => {
      const [status] = await Promise.all([loadStatus(), loadSettings(), syncRuntime(false)]);
      const nextFirmwareVersion = status?.firmware_version ?? message.firmware_version ?? '';
      if (
        previousFirmwareVersion &&
        nextFirmwareVersion &&
        previousFirmwareVersion !== nextFirmwareVersion
      ) {
        window.location.reload();
      }
    })();
  }, [firmwareVersion, isAuthenticated, lastMessage, loadSettings, loadStatus, syncRuntime]);

  return null;
}

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
    <FontScaleProvider>
      <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
        <TooltipProvider>
          <RealtimeProvider>
            <PumpRuntimeProvider>
              <DeviceLifecycleBridge />
              <Layout>{routes}</Layout>
            </PumpRuntimeProvider>
          </RealtimeProvider>
        </TooltipProvider>
      </ThemeProvider>
    </FontScaleProvider>
  );
};

export default App;
