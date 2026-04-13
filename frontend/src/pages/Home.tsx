import React, { useState } from 'react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import DeviceOverviewCard from '@/components/home/device-overview-card.tsx';
import PumpAgingCard from '@/components/home/pump-aging-card.tsx';
import PumpControlCard from '@/components/home/pump-control-card.tsx';
import ConnectivityStabilityCard from '@/components/home/connectivity-stability-card.tsx';
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
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto grid w-full max-w-screen-2xl gap-3 px-3 xl:grid-cols-12">
        {/* Left: Device Overview (with maintenance actions) */}
        <div className="min-w-0 xl:col-span-3 xl:row-span-3">
          <DeviceOverviewCard pumps={pumps} deviceStatus={deviceStatus} />
        </div>

        {/* Top right: Pump Aging */}
        <div className="min-w-0 xl:col-span-9">
          <PumpAgingCard
            pumps={pumps}
            resettingPumpId={resettingPumpId}
            onResetPumpCounter={(pumpId) => {
              void resetPumpCounter(pumpId);
            }}
          />
        </div>

        {/* Middle right: Today's Dosing */}
        <div className="min-w-0 xl:col-span-3 xl:h-full">
          <PumpHistoryTodayCard pumps={pumps} />
        </div>

        {/* Bottom right: Pump Control + Connectivity + System */}
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:col-span-6 xl:grid-cols-12">
          {/* Pump Control — full width */}
          <div className="md:col-span-2 xl:col-span-12">
            <PumpControlCard pumps={pumps} />
          </div>

          {/* Connectivity on top */}
          <div className="md:col-span-1 xl:col-span-6 xl:h-full">
            <ConnectivityStabilityCard deviceStatus={deviceStatus} />
          </div>

          {/* System below */}
          <div className="md:col-span-1 xl:col-span-6 xl:h-full">
            <SystemCard deviceStatus={deviceStatus} />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
