import React from 'react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import PumpHistoryCard from '@/components/home/pump-history-card.tsx';

const HistoryPage: React.FC = (): React.ReactElement => {
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-6 px-4 md:px-4">
        <PumpHistoryCard pumps={pumps} />
      </section>
    </div>
  );
};

export default HistoryPage;
