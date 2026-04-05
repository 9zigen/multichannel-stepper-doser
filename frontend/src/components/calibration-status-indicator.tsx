import React from 'react';
import { FlaskConical, Square } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { usePumpRuntime } from '@/components/pump-runtime-provider.tsx';
import { useAppStore } from '@/hooks/use-store.ts';

export function CalibrationStatusIndicator(): React.ReactElement | null {
  const pumps = useAppStore((state) => state.settings.pumps);
  const { calibratingRuns, stopCalibrationSession } = usePumpRuntime();

  if (calibratingRuns.length === 0) {
    return null;
  }

  const primaryRun = calibratingRuns[0];
  const pumpName = pumps.find((pump) => pump.id === primaryRun.id)?.name ?? `Pump ${primaryRun.id}`;

  const stop = async () => {
    const success = await stopCalibrationSession(primaryRun.id);
    if (success) {
      toast.success(`${pumpName} calibration stopped.`);
    } else {
      toast.error('Failed to stop calibration.');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="gap-2 border-amber-500/30 bg-amber-500/10 text-amber-700">
        <FlaskConical className="size-4" />
        {pumpName} calibrating
      </Badge>
      <Button variant="outline" size="sm" className="gap-2" onClick={stop}>
        <Square className="size-4" />
        Stop
      </Button>
    </div>
  );
}
