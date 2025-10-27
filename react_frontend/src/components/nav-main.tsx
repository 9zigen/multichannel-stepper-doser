'use client';
import { Link, useMatch } from 'react-router-dom';
import { type LucideIcon } from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

type NavMainProps = {
  items: {
    name: string;
    url: string;
    icon: LucideIcon;
  }[];
};

type NavMainItem = {
  name: string;
  url: string;
  icon: LucideIcon;
};
export const NavMain = (props: NavMainProps) => {
  const { items } = props;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Main</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item: NavMainItem) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild isActive={useMatch(item.url) !== null}>
              <Link to={item.url}>
                <item.icon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
};
