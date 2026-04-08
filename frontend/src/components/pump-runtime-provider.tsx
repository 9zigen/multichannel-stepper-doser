import React from 'react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { getPumpsRuntime, type PumpRuntimeEntry, type PumpState, PumpRunResponse, runPump } from '@/lib/api.ts';
import { useRealtimeConnection } from '@/components/realtime-provider.tsx';

type CalibrationSession = {
  pumpId: number;
  speed: number;
  direction: boolean;
  startedAt: number;
  stoppedAt: number | null;
};

type PumpRuntimeContextValue = {
  runtime: PumpRuntimeEntry[];
  calibratingRuns: PumpRuntimeEntry[];
  timedRuns: PumpRuntimeEntry[];
  calibrationSessions: Record<number, CalibrationSession>;
  lastRuntimeUpdateAt: number | null;
  syncRuntime: (showError?: boolean) => Promise<void>;
  beginCalibrationSession: (pump: PumpState, speed: number, direction: boolean) => Promise<boolean>;
  stopCalibrationSession: (pumpId: number) => Promise<boolean>;
  clearCalibrationSession: (pumpId: number) => void;
};

const PumpRuntimeContext = React.createContext<PumpRuntimeContextValue>({
  runtime: [],
  calibratingRuns: [],
  timedRuns: [],
  calibrationSessions: {},
  lastRuntimeUpdateAt: null,
  syncRuntime: async () => undefined,
  beginCalibrationSession: async () => false,
  stopCalibrationSession: async () => false,
  clearCalibrationSession: () => undefined,
});

const STORAGE_KEY = 'pump-calibration-sessions';

function readSessions(): Record<number, CalibrationSession> {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Record<number, CalibrationSession>;
    return parsed ?? {};
  } catch (_error) {
    return {};
  }
}

function writeSessions(value: Record<number, CalibrationSession>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function PumpRuntimeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const { lastMessage, status: realtimeStatus } = useRealtimeConnection();
  const [runtime, setRuntime] = React.useState<PumpRuntimeEntry[]>([]);
  const [calibrationSessions, setCalibrationSessions] = React.useState<Record<number, CalibrationSession>>(() =>
    readSessions()
  );
  const [lastRuntimeUpdateAt, setLastRuntimeUpdateAt] = React.useState<number | null>(null);

  const persistSessions = React.useCallback((nextValue: Record<number, CalibrationSession>) => {
    setCalibrationSessions(nextValue);
    writeSessions(nextValue);
  }, []);

  const syncRuntime = React.useCallback(async (showError = false) => {
    if (!isAuthenticated) {
      setRuntime([]);
      return;
    }

    try {
      const response = (await getPumpsRuntime<{ pumps: PumpRuntimeEntry[] }>()) ?? { pumps: [] };
      setRuntime(response.pumps ?? []);
      setLastRuntimeUpdateAt(Date.now());
    } catch (error) {
      if (showError) {
        toast.error('Failed to sync pump runtime.');
      }
      console.error(error);
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    void syncRuntime();
  }, [syncRuntime]);

  React.useEffect(() => {
    if (
      !lastMessage ||
      typeof lastMessage !== 'object' ||
      lastMessage === null ||
      !('type' in lastMessage) ||
      (lastMessage as { type?: string }).type !== 'pump_runtime' ||
      !('pump' in lastMessage)
    ) {
      return;
    }

    const incomingPump = (lastMessage as { pump: PumpRuntimeEntry }).pump;
    setLastRuntimeUpdateAt(Date.now());
    setRuntime((current) => {
      const next = [...current];
      const index = next.findIndex((entry) => entry.id === incomingPump.id);
      if (index >= 0) {
        next[index] = incomingPump;
        return next;
      }

      next.push(incomingPump);
      next.sort((left, right) => left.id - right.id);
      return next;
    });
  }, [lastMessage]);

  const activeRuntimeCount = React.useMemo(() => runtime.filter((entry) => entry.active).length, [runtime]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const intervalMs = realtimeStatus === 'connected' ? 15000 : activeRuntimeCount > 0 ? 1000 : 5000;
    const intervalId = window.setInterval(() => {
      void syncRuntime();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeRuntimeCount, isAuthenticated, realtimeStatus, syncRuntime]);

  React.useEffect(() => {
    const activeCalibrationIds = new Set(runtime.filter((entry) => entry.state === 'calibration').map((entry) => entry.id));
    const stoppedCalibrationIds = Object.keys(calibrationSessions)
      .map((value) => Number(value))
      .filter((pumpId) => {
        const session = calibrationSessions[pumpId];
        return session && session.stoppedAt === null && !activeCalibrationIds.has(pumpId);
      });

    if (stoppedCalibrationIds.length === 0) {
      return;
    }

    const nextSessions = { ...calibrationSessions };
    const stoppedAt = Date.now();
    for (const pumpId of stoppedCalibrationIds) {
      nextSessions[pumpId] = {
        ...nextSessions[pumpId],
        stoppedAt,
      };
    }
    persistSessions(nextSessions);
  }, [calibrationSessions, persistSessions, runtime]);

  const beginCalibrationSession = React.useCallback(
    async (pump: PumpState, speed: number, direction: boolean) => {
      try {
        const response = (await runPump({
          id: pump.id,
          speed,
          direction,
          time: -1,
        })) as PumpRunResponse;

        if (!response.success) {
          return false;
        }

        persistSessions({
          ...calibrationSessions,
          [pump.id]: {
            pumpId: pump.id,
            speed,
            direction,
            startedAt: Date.now(),
            stoppedAt: null,
          },
        });
        await syncRuntime();
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    [calibrationSessions, persistSessions, syncRuntime]
  );

  const stopCalibrationSession = React.useCallback(
    async (pumpId: number) => {
      const activeRun = runtime.find((entry) => entry.id === pumpId && entry.state === 'calibration');
      const fallbackSession = calibrationSessions[pumpId];

      if (!activeRun && !fallbackSession) {
        return false;
      }

      try {
        const response = (await runPump({
          id: pumpId,
          direction: activeRun?.direction ?? fallbackSession?.direction ?? true,
          speed: activeRun?.speed ?? fallbackSession?.speed ?? 1,
          time: 0,
        })) as PumpRunResponse;

        if (!response.success) {
          return false;
        }

        persistSessions({
          ...calibrationSessions,
          [pumpId]: {
            ...(fallbackSession ?? {
              pumpId,
              speed: activeRun?.speed ?? 1,
              direction: activeRun?.direction ?? true,
              startedAt: Date.now(),
            }),
            stoppedAt: Date.now(),
          },
        });
        await syncRuntime();
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    [calibrationSessions, persistSessions, runtime, syncRuntime]
  );

  const clearCalibrationSession = React.useCallback(
    (pumpId: number) => {
      const nextSessions = { ...calibrationSessions };
      delete nextSessions[pumpId];
      persistSessions(nextSessions);
    },
    [calibrationSessions, persistSessions]
  );

  const calibratingRuns = React.useMemo(() => runtime.filter((entry) => entry.state === 'calibration'), [runtime]);
  const timedRuns = React.useMemo(() => runtime.filter((entry) => entry.state === 'timed'), [runtime]);

  const value = React.useMemo(
    () => ({
      runtime,
      calibratingRuns,
      timedRuns,
      calibrationSessions,
      lastRuntimeUpdateAt,
      syncRuntime,
      beginCalibrationSession,
      stopCalibrationSession,
      clearCalibrationSession,
    }),
    [
      beginCalibrationSession,
      calibratingRuns,
      calibrationSessions,
      clearCalibrationSession,
      lastRuntimeUpdateAt,
      runtime,
      stopCalibrationSession,
      syncRuntime,
      timedRuns,
    ]
  );

  return <PumpRuntimeContext.Provider value={value}>{children}</PumpRuntimeContext.Provider>;
}

export function usePumpRuntime() {
  return React.useContext(PumpRuntimeContext);
}
