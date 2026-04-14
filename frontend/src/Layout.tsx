import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Toaster } from '@/components/ui/sonner';
import { AppSidebar } from '@/components/app-sidebar.tsx';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { SiteHeader } from '@/components/site-header.tsx';
import Login from '@/pages/Login';
import { Navigate, useLocation } from 'react-router-dom';
import { LoaderCircle, RotateCw } from 'lucide-react';
import { useRealtimeConnection } from '@/components/realtime-provider.tsx';
import './index.css';

interface LayoutProps {
  children: React.ReactElement;
}

export const Layout = ({ children }: LayoutProps): React.ReactElement => {
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const onboardingCompleted = useAppStore((state: AppStoreState) => state.settings.app.onboarding_completed);
  const { systemState } = useRealtimeConnection();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Login />;
  }

  const onboardingAllowedPaths = ['/onboarding', '/settings/network', '/settings/board'];
  const onboardingBlockingRequired =
    !onboardingCompleted && !onboardingAllowedPaths.some((path) => location.pathname.startsWith(path));
  if (onboardingBlockingRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" collapsible="icon" />
      <SidebarInset className="max-h-svh overflow-y-auto border border-border bg-background/75 backdrop-blur-sm">
        <SiteHeader />
        {systemState === 'restarting' && (
          <div className="px-2 pt-2 md:px-3 md:pt-3">
            <Alert className="border-amber-500/30 bg-amber-500/8 text-foreground">
              <RotateCw className="size-4 animate-spin" />
              <AlertTitle>Controller restarting</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>The device is shutting down and reconnecting. Data will refresh automatically when it is ready.</span>
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div className="flex flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">{children}</div>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
};
