import React, { useState } from "react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"

import { AppStoreState, useAppStore} from "@/hooks/use-store.ts";
import NetworkForm from "@/components/network-form.tsx";
import { MoreHorizontal, Trash2, Edit } from "lucide-react";
import {NetworkState} from "@/lib/api.ts";
import { Button } from "@/components/ui/button";

const NetworkPage: React.FC = (): React.ReactElement => {
    const networks = useAppStore((state: AppStoreState) => state.settings.networks);
    const addNetwork = useAppStore((state: AppStoreState) => state.addNetwork);
    const [selectedNetwork, setSelectedNetwork] = useState<NetworkState | null>(null);

    return (
        <div className="flex flex-col items-center justify-center">
            <section className="flex flex-col items-center justify-center gap-6 w-full sm:w-[400px]">
                <div className="flex flex-row bg-gray-50 rounded-md p-6 w-full shadow-xl">
                    <div className="flex flex-col w-full">
                        <p className="text-xl font-bold">
                            Network
                        </p>
                        <p className="text-base pb-4">
                            WiFI connection settings
                        </p>

                        {
                            networks.length? networks.map((x, index) => {
                                return (
                                    <div key={index} className="w-full flex flex-col gap-6">
                                        <div className="flex flex-row gap-4 justify-between items-center w-full h-[30px]">
                                            <span>{x.ssid}</span>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                   <span className="flex items-center w-5 cursor-pointer">
                                                       <MoreHorizontal />
                                                   </span>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="w-32 rounded-lg">
                                                    <DropdownMenuItem onClick={() => setSelectedNetwork({...x})}>
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
                                    </div>
                                )
                            }) :
                                <React.Fragment>
                                    <span className="mb-2">no connections have been created yet</span>
                                    <Button onClick={addNetwork}>Add connection</Button>
                                </React.Fragment>
                        }
                    </div>
                </div>

                <Drawer open={selectedNetwork !== null} onClose={() => setSelectedNetwork(null)}>
                    <DrawerContent className="px-4 pb-4">
                        <div className="flex flex-col w-full sm:w-[400px] items-center mx-auto">
                            <DrawerHeader>
                                <DrawerTitle>Edit: {selectedNetwork?.ssid}</DrawerTitle>
                                <DrawerDescription>This action cannot be undone.</DrawerDescription>
                            </DrawerHeader>
                            <div className="flex flex-col p-4 gap-4">
                                {
                                    selectedNetwork === null ? null : <NetworkForm network={selectedNetwork} success={() => setSelectedNetwork(null)}/>
                                }
                            </div>
                        </div>
                    </DrawerContent>
                </Drawer>
            </section>
        </div>
    );
};

export default NetworkPage;
