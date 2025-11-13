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

export function SiteHeader(): React.ReactElement {
  const location = useLocation();
  const pathNames = location.pathname.split('/').filter((x) => x);
  const { theme, setTheme } = useTheme();

  const routes = [
    { path: '/', name: 'Home' },
    { path: '/settings', name: 'Settings' },
    { path: '/settings/general', name: 'General' },
    { path: '/settings/network', name: 'Network' },
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
    <header className="flex h-16 shrink-0 items-center">
      <div className="flex items-center gap-2 px-4 justify-between w-full">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <div className="flex w-full justify-between items-center">
          <Breadcrumbs />
          <ButtonTheme />
        </div>
      </div>
    </header>
  );
}
