import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { AppSidebar } from '@/components/app-sidebar.tsx';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { SiteHeader } from '@/components/site-header.tsx';
import Login from '@/pages/Login';
import './index.css';

interface LayoutProps {
  children: React.ReactElement;
}

export const Layout = ({ children }: LayoutProps): React.ReactElement => {
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" collapsible="icon" />
      <SidebarInset className="overflow-hidden border border-white/40 bg-background/75 backdrop-blur-sm">
        <SiteHeader />
        <div className="flex flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">{children}</div>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
};
