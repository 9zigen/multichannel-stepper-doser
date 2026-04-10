import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { AppSidebar } from '@/components/app-sidebar.tsx';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { SiteHeader } from '@/components/site-header.tsx';
import Login from '@/pages/Login';
import { Navigate, useLocation } from 'react-router-dom';
import './index.css';

interface LayoutProps {
  children: React.ReactElement;
}

export const Layout = ({ children }: LayoutProps): React.ReactElement => {
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const onboardingCompleted = useAppStore((state: AppStoreState) => state.settings.app.onboarding_completed);
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
      <SidebarInset className="overflow-hidden border border-border bg-background/75 backdrop-blur-sm">
        <SiteHeader />
        <div className="flex flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">{children}</div>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
};
