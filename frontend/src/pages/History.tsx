import React from 'react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import PumpHistoryCard from '@/components/home/pump-history-card.tsx';

const HistoryPage: React.FC = (): React.ReactElement => {
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <PumpHistoryCard pumps={pumps} />
      </section>
    </div>
  );
};

export default HistoryPage;
