"use client"
import * as React from "react"
import {
    Home,
    Network,
    CalendarClock,
    Settings2,
    LogOut
} from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import { AppStoreState, useAppStore } from "@/hooks/use-store.ts";
import { NavMain } from "@/components/nav-main.tsx";
import { NavSettings } from "@/components/nav-settings.tsx";

const navigation = {
    navMain: [
        {
            name: "Home",
            url: "/",
            icon: Home,
        },
        {
            name: "Schedule",
            url: "/schedule",
            icon: CalendarClock,
        }],
    navSettings: [
        {
            title: "Settings",
            url: "/settings",
            icon: Settings2,
            isActive: true,
            items: [
                {
                    title: "General",
                    url: "/settings/general",
                },
                {
                    title: "Network",
                    url: "/settings/network",
                    icon: Network,
                },
                {
                    title: "Services",
                    url: "/settings/services",
                },
                {
                    title: "Pumps",
                    url: "/settings/pumps",
                }
            ],
        }
    ]
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const logout = useAppStore((state: AppStoreState) => state.logout);

    return (
        <Sidebar collapsible="icon" {...props}>
            {/*<SidebarHeader>*/}
            {/*    <h6>Controller</h6>*/}
            {/*    /!*<TeamSwitcher teams={data.teams} />*!/*/}
            {/*</SidebarHeader>*/}
            <SidebarContent>
                <NavMain items={navigation.navMain} />
                <NavSettings items={navigation.navSettings} />
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
    )
}