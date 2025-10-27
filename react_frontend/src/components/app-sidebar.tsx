'use client';
import * as React from 'react';
import { Home, Network, CalendarClock, LogOut, Cog, Play, Disc } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { NavMain } from '@/components/nav-main.tsx';

const navigation = {
  navMain: [
    {
      name: 'Home',
      url: '/',
      icon: Home,
    },
    {
      name: 'Schedule',
      url: '/schedule',
      icon: CalendarClock,
    },
  ],
  navSettings: [
    {
      name: 'General',
      url: '/settings/general',
      icon: Cog,
    },
    {
      name: 'Network',
      url: '/settings/network',
      icon: Network,
    },
    {
      name: 'Services',
      url: '/settings/services',
      icon: Play,
    },
    {
      name: 'Pumps',
      url: '/settings/pumps',
      icon: Disc,
    },
  ],
  // navSettings: [
  //     {
  //         title: "Settings",
  //         url: "/settings",
  //         icon: Settings2,
  //         isActive: true,
  //         items: [
  //             {
  //                 title: "General",
  //                 url: "/settings/general",
  //             },
  //             {
  //                 title: "Network",
  //                 url: "/settings/network",
  //                 icon: Network,
  //             },
  //             {
  //                 title: "Services",
  //                 url: "/settings/services",
  //             },
  //             {
  //                 title: "Pumps",
  //                 url: "/settings/pumps",
  //             }
  //         ],
  //     }
  // ]
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const logout = useAppStore((state: AppStoreState) => state.logout);

  return (
    <Sidebar {...props} variant="inset">
      <SidebarContent>
        <NavMain items={navigation.navMain} />
        <NavMain items={navigation.navSettings} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a onClick={logout}>
                <LogOut />
                <span>Logout</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
