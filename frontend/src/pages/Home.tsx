import React, { useState } from 'react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import DeviceOverviewCard from '@/components/home/device-overview-card.tsx';
import PumpAgingCard from '@/components/home/pump-aging-card.tsx';
import PumpControlCard from '@/components/home/pump-control-card.tsx';
import ConnectivityStabilityCard from '@/components/home/connectivity-stability-card.tsx';
import MaintenanceActionsCard from '@/components/home/maintenance-actions-card.tsx';
import SystemCard from '@/components/home/system-card.tsx';
import PumpHistoryTodayCard from '@/components/home/pump-history-today-card.tsx';

const Home: React.FC = (): React.ReactElement => {
  const deviceStatus = useAppStore((state: AppStoreState) => state.status);
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);
  const updatePump = useAppStore((state: AppStoreState) => state.updatePump);
  const [resettingPumpId, setResettingPumpId] = useState<number | null>(null);

  const resetPumpCounter = async (pumpId: number) => {
    const pump = pumps.find((item) => item.id === pumpId);
    if (!pump) {
      return;
    }

    try {
      setResettingPumpId(pumpId);
      const result = await updatePump({ ...pump, running_hours: 0 }, true);
      if (result) {
        toast.success(`${pump.name} running-hours counter reset.`);
      } else {
        toast.error(`Failed to reset ${pump.name} running-hours counter.`);
      }
    } finally {
      setResettingPumpId(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-6 px-4 md:px-4 xl:grid-cols-12">
        <div className="xl:col-span-3 xl:row-span-3 xl:h-full">
          <DeviceOverviewCard pumps={pumps} deviceStatus={deviceStatus} />
        </div>

        <div className="xl:col-span-9">
          <PumpAgingCard
            pumps={pumps}
            resettingPumpId={resettingPumpId}
            onResetPumpCounter={(pumpId) => {
              void resetPumpCounter(pumpId);
            }}
          />
        </div>
        
        <div className="xl:col-span-3 xl:h-full">
          <PumpHistoryTodayCard pumps={pumps} />
        </div>

        <div className="xl:col-span-6 grid grid-cols-12 gap-6">
          <div className="xl:col-span-12">
            <PumpControlCard pumps={pumps} />
          </div>
          
          <div className="xl:col-span-6 xl:h-full">
            <SystemCard deviceStatus={deviceStatus} />
          </div>
          
          <div className="xl:col-span-6 xl:h-full">
            <ConnectivityStabilityCard deviceStatus={deviceStatus} />
          </div>
          
          <div className="xl:col-span-12 xl:h-full">
            <MaintenanceActionsCard />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
