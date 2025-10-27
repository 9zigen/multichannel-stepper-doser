import React from 'react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import DeviceInfo, { DeviceInfoProps } from '@/components/device-info.tsx';
import PumpControl from '@/components/pump-control.tsx';

const Home: React.FC = (): React.ReactElement => {
  const deviceStatus = useAppStore((state: AppStoreState) => state.status);
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);

  return (
    <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in">
      <section className="flex flex-col items-center gap-6 sm:w-[400px] xl:w-[600px]">
        <PumpControl pumps={pumps} />
        <DeviceInfo {...(deviceStatus as DeviceInfoProps)} />
      </section>
    </div>
  );
};

export default Home;
