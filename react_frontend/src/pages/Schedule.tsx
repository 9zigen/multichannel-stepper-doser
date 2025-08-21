import React, {useEffect, useState} from "react";

import { AppStoreState, useAppStore} from "@/hooks/use-store.ts";
import ScheduleForm from "@/components/schedule-form.tsx";
import DeviceInfo, { DeviceInfoProps } from "@/components/device-info.tsx";
import PumpControl  from "@/components/pump-control.tsx";
import {useIsMobile} from "@/hooks/use-mobile.ts";
import {PumpState} from "@/lib/api.ts";
import {Badge} from "@/components/ui/badge.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem, DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {Cylinder, Edit, MoreVertical, PillBottle, Trash2} from "lucide-react";
import {Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle} from "@/components/ui/drawer.tsx";
import PumpForm from "@/components/pump-form.tsx";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog.tsx";

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

const Schedule: React.FC = (): React.ReactElement => {
    const appStore = useAppStore();
    const { settings } = appStore;
    const { pumps } = settings;
    const [selectedPump, setSelectedPump] = useState<PumpState | null>(null);

    useEffect(() => {
        if (selectedPump !== null) {
            const pump = pumps.find(x => x.id === selectedPump.id)
            if (pump != undefined) {
                setSelectedPump(pump)
            }
        }
    }, [settings]);

    return (
        <div className="flex flex-col items-center justify-center gap-6">
            <section className="flex flex-col items-center justify-center gap-6 w-full sm:w-[400px]">
                {
                    pumps?.map(pump => {
                        const percentage = pump.tank_current_vol / pump.tank_full_vol * 100
                        return (
                            <Card key={pump.id} className="w-full">
                                <CardHeader>
                                    <CardTitle>{pump.name}</CardTitle>
                                    <CardDescription>
                                        <div className="flex flex-row items-center gap-1">
                                            <Cylinder size={16}/>{percentage}%
                                        </div>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ScheduleForm pump={pump} />
                                </CardContent>
                            </Card>
                        )
                    })
                }
            </section>
        </div>
    );
};

export default Schedule;