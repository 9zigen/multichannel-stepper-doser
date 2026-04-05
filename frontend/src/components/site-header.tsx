import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb.tsx';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button.tsx';
import { Moon, Sun } from 'lucide-react';
import { BackendConnectionIndicator } from '@/components/backend-connection-indicator.tsx';
import { CalibrationStatusIndicator } from '@/components/calibration-status-indicator.tsx';

export function SiteHeader(): React.ReactElement {
  const location = useLocation();
  const pathNames = location.pathname.split('/').filter((x) => x);
  const { theme, setTheme } = useTheme();

  const routes = [
    { path: '/', name: 'Home' },
    { path: '/settings', name: 'Settings' },
    { path: '/settings/firmware', name: 'Firmware' },
    { path: '/settings/network', name: 'Network' },
    { path: '/settings/services', name: 'Services' },
    { path: '/settings/pumps', name: 'Pumps' },
    { path: '/settings/api', name: 'API' },
  ];

  const Breadcrumbs: React.FC = () => {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <Link to={'/'}>Home</Link>
          </BreadcrumbItem>

          {pathNames.map((_value: string, index: number) => {
            const to = `/${pathNames.slice(0, index + 1).join('/')}`;
            const routeName = routes.find((route) => route.path === to)?.name;

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
    );
  };

  return (
    <header className="sticky top-0 z-10 flex h-18 shrink-0 items-center border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between gap-3 px-5 py-3 md:px-6">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-7" />
        <div className="flex w-full items-center justify-between">
          <Breadcrumbs />
          <div className="flex items-center gap-2">
            <CalibrationStatusIndicator />
            <BackendConnectionIndicator />
            <ButtonTheme />
          </div>
        </div>
      </div>
    </header>
  );
}
