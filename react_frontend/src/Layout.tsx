import React from 'react'

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb.tsx";
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/app-sidebar.tsx";
import { AppStoreState, useAppStore } from "@/hooks/use-store.ts";
import Login from "@/pages/Login";
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area"
import './index.css'

interface LayoutProps {
  children: React.ReactElement;
}

export const Layout = ({ children }: LayoutProps): React.ReactElement => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(x => x);
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const { theme, setTheme } = useTheme()
  
  if (!isAuthenticated) {
    return <Login />
  }
  
  const routes = [
    { path: '/', name: 'Home'},
    { path: '/settings', name: 'Settings' },
    { path: '/settings/general', name: 'General' },
    { path: '/settings/network', name: 'Network' },
  ];
  
  const Breadcrumbs: React.FC = () => {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <Link to={"/"}>
              Home
            </Link>
          </BreadcrumbItem>
          
          {pathnames.map((_value: string, index: number) => {
            // const last = index === pathnames.length - 1;
            const to = `/${pathnames.slice(0, index + 1).join('/')}`;
            const routeName = routes.find(route => route.path === to)?.name;
            
            return (
              <React.Fragment key={to}>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{routeName}</BreadcrumbPage>
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  };
  
  const ButtonTheme = () => {
    return (
      <Button variant="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>
    )
  }
  
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="p-6">
        <header className="w-full flex h-16 shrink-0 items-center gap-2 border-b bg-card rounded-2xl shadow-sm">
          <div className="flex w-full items-center gap-4 px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6 w-[2px]" />
            <div className="flex w-full justify-between items-center">
              <Breadcrumbs/>
              <ButtonTheme/>
            </div>
          </div>
        </header>
        
        <ScrollArea className="h-[calc(100vh-64px)] w-full pt-12">
          {children}
        </ScrollArea>
        
        {/*<div className="flex flex-1 flex-col gap-4 p-4 pt-16">*/}
        {/*  {children}*/}
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
  )
};
