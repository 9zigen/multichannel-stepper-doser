import React from "react";

import { AppStoreState, useAppStore} from "@/hooks/use-store.ts";
import ServicesForm from "@/components/services-form";

const ServicesPage: React.FC = (): React.ReactElement => {
    const serviceState = useAppStore((state: AppStoreState) => state.settings.services);

    return (
        <div className="flex flex-col items-center justify-center">
            <section className="flex flex-col items-center justify-center gap-6 w-full sm:w-[400px]">
                <div className="flex flex-row bg-gray-50 rounded-md p-4 w-full">
                    <div className="flex flex-col w-full">
                        <p className="text-xl font-bold">
                            Services
                        </p>
                        <p className="text-base pb-4">
                            Device services settings
                        </p>
                        <ServicesForm services={serviceState} />
                    </div>
                </div>
            </section>
        </div>
    );
};

export default ServicesPage;