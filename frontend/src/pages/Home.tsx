import React from 'react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import SoftwareInfo, { SoftwareInfoProps } from '@/components/home/software-info.tsx';
import HardwareInfo, { HardwareInfoProps } from '@/components/home/hardware-info.tsx';
import PumpControl from '@/components/pump-control.tsx';

const Home: React.FC = (): React.ReactElement => {
  const deviceStatus = useAppStore((state: AppStoreState) => state.status);
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);

  return (
    <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in">
      <section className="container flex gap-6 px-6">
        <div className="flex">
          <PumpControl pumps={pumps} />
        </div>
        <div className="flex">
          <SoftwareInfo {...(deviceStatus as SoftwareInfoProps)} />
        </div>
        <div className="flex">
          <HardwareInfo {...(deviceStatus as HardwareInfoProps)} />
        </div>
      </section>
    </div>
  );
};

export default Home;
