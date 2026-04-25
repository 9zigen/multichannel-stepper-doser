import React from 'react';

import { getPumpsHistory, PumpHistoryPump, PumpHistoryState, PumpState } from '@/lib/api.ts';
import { BACKEND_SYSTEM_READY_EVENT } from '@/lib/device-events.ts';

type UsePumpHistoryResult = {
  history: PumpHistoryState | null;
  loading: boolean;
  historyPumps: PumpHistoryPump[];
  selectedPump: PumpHistoryPump | null;
  selectedPumpId: number | null;
  setSelectedPumpId: (id: number) => void;
  reloadHistory: () => Promise<void>;
  pumps: PumpState[];
};

export const usePumpHistory = (pumps: PumpState[]): UsePumpHistoryResult => {
  const [history, setHistory] = React.useState<PumpHistoryState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedPumpId, setSelectedPumpId] = React.useState<number | null>(pumps[0]?.id ?? null);

  const loadHistory = React.useCallback(async (canCommit: () => boolean = () => true) => {
    try {
      setLoading(true);
      const response = await getPumpsHistory<PumpHistoryState>();
      if (!canCommit()) {
        return;
      }

      setHistory(response);
      setSelectedPumpId((current) => current ?? response.pumps[0]?.id ?? null);
    } catch (error) {
      console.error(error);
    } finally {
      if (canCommit()) {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    let active = true;

    const handleBackendReady = () => {
      void loadHistory(() => active);
    };

    void loadHistory(() => active);
    window.addEventListener(BACKEND_SYSTEM_READY_EVENT, handleBackendReady);

    return () => {
      active = false;
      window.removeEventListener(BACKEND_SYSTEM_READY_EVENT, handleBackendReady);
    };
  }, [loadHistory]);

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
    reloadHistory: () => loadHistory(),
    pumps,
  };
};
