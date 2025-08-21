import React, {useEffect, useState} from "react";

import { Badge } from "@/components/ui/badge"

import { PumpState } from "@/lib/api.ts";
import { useAppStore } from "@/hooks/use-store.ts";
import PumpForm from "@/components/pump-form.tsx";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Edit, MoreVertical, Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile.ts";

const PumpsPage: React.FC = (): React.ReactElement => {
    const isMobile = useIsMobile();
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
                            <div key={pump.id} className="flex flex-row bg-gray-50 rounded-md p-4 w-full">
                                <div className="flex flex-col w-full">
                                    <p className="text-xl font-bold">
                                        {pump.name}
                                    </p>
                                    <Badge className='bg-gray-500'>{percentage.toFixed(2)} %</Badge>
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                       <span className="flex items-center w-5 cursor-pointer">
                                           <MoreVertical />
                                       </span>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-32 rounded-lg">
                                        <DropdownMenuItem onClick={() => setSelectedPump({...pump})}>
                                            <Edit className="text-muted-foreground" />
                                            <span>Edit</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => {console.log("delete")}}>
                                            <Trash2 className="text-muted-foreground" />
                                            <span>Delete</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )
                    })
                }

                {
                    isMobile? (
                        <Drawer
                            open={selectedPump !== null}
                            onClose={() => setSelectedPump(null)}
                        >
                            <DrawerContent className="px-4 pb-4">
                                <div className="flex flex-col w-full sm:w-[400px] items-center mx-auto">
                                    <DrawerHeader className="text-center">
                                        <DrawerTitle>Edit: {selectedPump?.name}</DrawerTitle>
                                        <DrawerDescription>This action cannot be undone.</DrawerDescription>
                                    </DrawerHeader>
                                    <div className="flex flex-col">
                                        {
                                            selectedPump === null ? null : <PumpForm pump={selectedPump} success={() => setSelectedPump(null)}/>
                                        }
                                    </div>
                                </div>
                            </DrawerContent>
                        </Drawer>
                    ) : (
                        <Dialog
                            open={selectedPump !== null}
                            onOpenChange={() => setSelectedPump(null)}
                        >
                            <DialogContent className="sm:max-w-[425px] lg:max-w-[500px] xl:max-w-[800px]">
                                <DialogHeader>
                                    <DialogTitle>Edit: {selectedPump?.name}</DialogTitle>
                                    <DialogDescription>This action cannot be undone.</DialogDescription>
                                </DialogHeader>
                                <div className="flex flex-col">
                                    {
                                        selectedPump === null ? null : <PumpForm pump={selectedPump} success={() => setSelectedPump(null)}/>
                                    }
                                </div>
                            </DialogContent>
                        </Dialog>
                    )
                }

            </section>
        </div>
    );
};

export default PumpsPage;