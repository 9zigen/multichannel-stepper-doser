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
import { useFontScale } from '@/components/font-scale-provider';
import { Button } from '@/components/ui/button.tsx';
import { AlertTriangle, Moon, Sun } from 'lucide-react';
import { BackendConnectionIndicator } from '@/components/backend-connection-indicator.tsx';
import { CalibrationStatusIndicator } from '@/components/calibration-status-indicator.tsx';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { Badge } from '@/components/ui/badge';
import {useRealtimeConnection} from "@/components/realtime-provider.tsx";

export function SiteHeader(): React.ReactElement {
  const location = useLocation();
  const pathNames = location.pathname.split('/').filter((x) => x);
  const { theme, setTheme } = useTheme();
  const { fontScale, setFontScale } = useFontScale();
  const status = useAppStore((state: AppStoreState) => state.status);
  const { systemState } = useRealtimeConnection();

  const routes = [
    { path: '/', name: 'Home' },
    { path: '/settings', name: 'Settings' },
    { path: '/settings/firmware', name: 'Firmware' },
    { path: '/settings/network', name: 'Network' },
    { path: '/settings/board', name: 'Board' },
    { path: '/settings/aging', name: 'Aging' },
    { path: '/settings/services', name: 'Services' },
    { path: '/settings/pumps', name: 'Pumps' },
    { path: '/settings/api', name: 'API' },
    { path: '/onboarding', name: 'Onboarding' },
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

  const ButtonFontScale = () => {
    const isLarge = fontScale === 'large';
    return (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 font-medium text-muted-foreground hover:text-foreground"
        title={isLarge ? 'Switch to default text size' : 'Switch to large text size'}
        onClick={() => setFontScale(isLarge ? 'default' : 'large')}
      >
        <span style={{ fontSize: '11px' }} className={isLarge ? 'text-muted-foreground' : 'text-foreground'}>a</span>
        <span style={{ fontSize: '16px' }} className={isLarge ? 'text-foreground' : 'text-muted-foreground'}>A</span>
      </Button>
    );
  };

  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      {!status.time_valid && (
        <div className="border-b border-border/80 bg-secondary/60">
          <div className="flex items-center justify-between gap-3 px-5 py-2 text-sm md:px-6">
            <div className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="size-4" />
              <span className="font-medium">{status.time_warning || 'Time is not set.'}</span>
            </div>
            <Badge variant="outline" className="border-border bg-background/70 text-foreground">
              Periodic paused
            </Badge>
          </div>
        </div>
      )}
      {systemState === 'restarting' && (
        <div className="border-b border-border/80 bg-secondary/60">
          <div className="flex items-center justify-between gap-3 px-5 py-2 text-sm md:px-6">
            <div className="flex items-center gap-2 text-foreground animate-pulse">
              <AlertTriangle className="size-4" />
              <span className="font-medium">Controller restarting</span>
            </div>
            <Badge variant="outline" className="border-border bg-background/70 text-foreground">
              The device is shutting down and reconnecting. Data will refresh automatically when it is ready
            </Badge>
          </div>
        </div>
      )}
      <div className="flex h-18 w-full items-center justify-between gap-3 px-5 py-3 md:px-6">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-7" />
        <div className="flex w-full items-center justify-between">
          <Breadcrumbs />
          <div className="flex items-center gap-2">
            <CalibrationStatusIndicator />
            <BackendConnectionIndicator />
            <ButtonFontScale />
            <ButtonTheme />
          </div>
        </div>
      </div>
    </header>
  );
}
