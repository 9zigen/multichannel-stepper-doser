import React from 'react';

import { getPumpsHistory, PumpHistoryPump, PumpHistoryState, PumpState } from '@/lib/api.ts';

type UsePumpHistoryResult = {
  history: PumpHistoryState | null;
  loading: boolean;
  historyPumps: PumpHistoryPump[];
  selectedPump: PumpHistoryPump | null;
  selectedPumpId: number | null;
  setSelectedPumpId: (id: number) => void;
  pumps: PumpState[];
};

export const usePumpHistory = (pumps: PumpState[]): UsePumpHistoryResult => {
  const [history, setHistory] = React.useState<PumpHistoryState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedPumpId, setSelectedPumpId] = React.useState<number | null>(pumps[0]?.id ?? null);

  React.useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        setLoading(true);
        const response = await getPumpsHistory<PumpHistoryState>();
        if (!active) {
          return;
        }

        setHistory(response);
        setSelectedPumpId((current) => current ?? response.pumps[0]?.id ?? null);
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const historyPumps = history?.pumps ?? [];

  const selectedPump = React.useMemo<PumpHistoryPump | null>(() => {
    if (historyPumps.length === 0) {
      return null;
    }

    return historyPumps.find((pump) => pump.id === selectedPumpId) ?? historyPumps[0];
  }, [historyPumps, selectedPumpId]);

  return {
    history,
    loading,
    historyPumps,
    selectedPump,
    selectedPumpId,
    setSelectedPumpId,
    pumps,
  };
};
