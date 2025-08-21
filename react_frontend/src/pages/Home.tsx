import React from "react";

import { AppStoreState, useAppStore} from "@/hooks/use-store.ts";
import DeviceInfo, { DeviceInfoProps } from "@/components/device-info.tsx";
import PumpControl  from "@/components/pump-control.tsx";

const Home: React.FC = (): React.ReactElement => {
    const deviceStatus = useAppStore((state: AppStoreState) => state.status);
    const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);

    return (
        <div className="flex flex-col items-center justify-center gap-4">
            <section className="flex flex-col items-center gap-6">
                <div className="flex flex-row bg-gray-50 rounded-md p-4 w-full">
                    <PumpControl pumps={pumps} />
                </div>

                <div className="flex flex-row bg-gray-50 rounded-md p-4 w-full">
                    <DeviceInfo {...(deviceStatus as DeviceInfoProps)} />
                </div>
            </section>
        </div>
    );
};

export default Home;