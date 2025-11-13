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
      <SidebarInset>
        <SiteHeader />
        {/*<ScrollArea className="h-[calc(100vh-64px)] w-full pt-12">{children}</ScrollArea>*/}

        {/*<div className="flex flex-1 flex-col gap-4 p-4 pt-16">*/}
        {children}
        {/*</div>*/}
        {/*<div className="container mx-auto px-4">*/}
        {/*<ScrollArea className="h-[calc(100vh-64px)] w-full">*/}
        {/*</ScrollArea>*/}
        {/*</div>*/}
        <Toaster />
        {/*<div className="flex flex-1 flex-col gap-4 p-4 pt-0">*/}
        {/*  <div className="grid auto-rows-min gap-4 md:grid-cols-3">*/}
        {/*    <div className="aspect-video rounded-xl bg-muted/50" />*/}
        {/*    <div className="aspect-video rounded-xl bg-muted/50" />*/}
        {/*    <div className="aspect-video rounded-xl bg-muted/50" />*/}
        {/*  </div>*/}
        {/*  <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />*/}
        {/*</div>*/}
      </SidebarInset>
    </SidebarProvider>
  );
};
