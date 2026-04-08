import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { z } from 'zod';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { BoardConfigState, PumpRunResponse, runPump, getBoardConfig } from '@/lib/api.ts';
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { AlertTriangle, LoaderCircle, Square } from 'lucide-react';
import { usePumpRuntime } from '@/components/pump-runtime-provider.tsx';
import {
  createEmptyBoardConfig,
  formatRemainingDuration,
  getChannelConfig,
  getChannelMaxRpm,
} from '@/lib/board-config.ts';

export interface PumpControlState {
  id: number;
  name: string;
}
export interface PumpControlProps {
  pumps: PumpControlState[];
}

type FormData = {
  pump_id: number;
  direction: boolean;
  speed: number;
  time: number;
};

const FormSchema = z.object({
  pump_id: z.number().min(0, 'Please select a pump to control.'),
  direction: z.boolean(),
  speed: z.number().min(0.1, 'Please select a pump working speed.'),
  time: z.number().min(1, 'Please select a pump working time.'),
});

export default function PumpControlCard(props: PumpControlProps) {
  const { pumps } = props;
  const { runtime, syncRuntime, lastRuntimeUpdateAt } = usePumpRuntime();
  const [boardConfig, setBoardConfig] = React.useState<BoardConfigState>(createEmptyBoardConfig);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      pump_id: undefined,
      direction: true,
      speed: 1,
      time: 1,
    },
  });

  const pumpId = watch('pump_id');
  const speed = watch('speed');
  const activeRuns = React.useMemo(() => runtime.filter((entry) => entry.active), [runtime]);
  const primaryActiveRun = React.useMemo(() => activeRuns[0] ?? null, [activeRuns]);
  const pumpIsRunning = activeRuns.length > 0;
  const availablePumps = React.useMemo(
    () => pumps.filter((pump) => pump.id < Math.max(1, boardConfig.motors_num)),
    [boardConfig.motors_num, pumps]
  );
  const selectedPumpName = availablePumps.find((pump) => pump.id === pumpId)?.name ?? 'Selected pump';
  const selectedActiveRun = React.useMemo(() => {
    if (pumpId !== undefined) {
      const matchingEntry = activeRuns.find((entry) => entry.id === pumpId);
      if (matchingEntry) {
        return matchingEntry;
      }
    }

    return primaryActiveRun;
  }, [activeRuns, primaryActiveRun, pumpId]);
  const selectedChannel = React.useMemo(() => getChannelConfig(boardConfig, pumpId), [boardConfig, pumpId]);
  const maxRpm = React.useMemo(() => getChannelMaxRpm(selectedChannel ?? undefined), [selectedChannel]);
  const [now, setNow] = React.useState(() => Date.now());
  const displayedRemainingSeconds = React.useMemo(() => {
    if (!selectedActiveRun || selectedActiveRun.state !== 'timed') {
      return 0;
    }

    const elapsedSeconds = lastRuntimeUpdateAt ? Math.max(0, (now - lastRuntimeUpdateAt) / 1000) : 0;
    return Math.max(0, selectedActiveRun.remaining_seconds - elapsedSeconds);
  }, [lastRuntimeUpdateAt, now, selectedActiveRun]);

  React.useEffect(() => {
    const loadBoardConfig = async () => {
      try {
        const response = await getBoardConfig<BoardConfigState>();
        setBoardConfig(response);
      } catch (error) {
        console.error(error);
      }
    };

    void loadBoardConfig();
  }, []);

  React.useEffect(() => {
    if (!selectedActiveRun || selectedActiveRun.state !== 'timed') {
      return;
    }

    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [selectedActiveRun]);

  React.useEffect(() => {
    if (selectedActiveRun) {
      setValue('pump_id', selectedActiveRun.id);
    }
  }, [selectedActiveRun, setValue]);

  React.useEffect(() => {
    if (pumpId === undefined) {
      return;
    }

    const selectedPumpAvailable = availablePumps.some((pump) => pump.id === pumpId);
    if (!selectedPumpAvailable) {
      setValue('pump_id', availablePumps[0]?.id);
    }
  }, [availablePumps, pumpId, setValue]);

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (data.speed > maxRpm) {
      toast.error(`Selected speed exceeds max ${maxRpm} RPM for this channel.`);
      return;
    }

    try {
      const action = {
        id: data.pump_id,
        direction: data.direction,
        speed: data.speed,
        time: data.time,
      };
      const response = (await runPump(action)) as PumpRunResponse;
      if (response.success) {
        await syncRuntime();
        toast.success('Pump started.');
      } else {
        toast.error('Pump failed.');
      }
    } catch (e) {
      toast.error('Pump failed.');
      console.error(e);
    }
  };

  const emergencyStop = async () => {
    if (!selectedActiveRun) {
      return;
    }

    try {
      const response = (await runPump({
        id: selectedActiveRun.id,
        direction: true,
        speed: selectedActiveRun.speed || 1,
        time: 0,
      })) as PumpRunResponse;

      if (response.success) {
        await syncRuntime();
        const pumpName = pumps.find((pump) => pump.id === selectedActiveRun.id)?.name ?? `Pump ${selectedActiveRun.id}`;
        toast.error(`${pumpName} stopped.`);
      } else {
        toast.error('Emergency stop failed.');
      }
    } catch (e) {
      toast.error('Emergency stop failed.');
      console.error(e);
    }
  };

  if (pumps.length === 0) {
    return null;
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden border-white/45 bg-card/82 shadow-lg">
      <CardHeader>
        <CardTitle>Pump Control</CardTitle>
        <CardDescription>Manual control of pumps with live runtime feedback and immediate stop support.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {selectedActiveRun ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-4" />
                Pump activity detected
              </div>
              <div className="text-muted-foreground">
                {(pumps.find((pump) => pump.id === selectedActiveRun.id)?.name ?? `Pump ${selectedActiveRun.id}`) +
                  ` is ${selectedActiveRun.state === 'timed' ? 'running' : selectedActiveRun.state} at ${
                    selectedActiveRun.speed
                  } rpm`}
                {selectedActiveRun.state === 'timed' && displayedRemainingSeconds > 0
                  ? ` with ${formatRemainingDuration(displayedRemainingSeconds)} remaining.`
                  : '.'}
              </div>
              {activeRuns.length > 1 ? (
                <div className="mt-2 text-xs text-muted-foreground">{activeRuns.length} pumps are currently active.</div>
              ) : null}
            </div>
          ) : null}
          <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-row gap-4">
              <div className="w-[50%] mb-2">
                <div className="text-gray-500 pb-1">
                  <label>Pump</label>
                </div>
                <Controller
                  name="pump_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(value) => field.onChange(Number(value))}
                      defaultValue={String(field.value)}
                      disabled={pumpIsRunning}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pump" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePumps.map((x, index) => {
                          return (
                            <SelectItem key={index} value={String(x.id)}>
                              {x.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.pump_id && <p role="alert">{errors.pump_id?.message}</p>}
              </div>
              <div className="w-[50%] mb-2">
                <div className="text-gray-500 pb-1">
                  <label>Direction</label>
                </div>
                <Controller
                  name="direction"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(value) => field.onChange(value === 'true')}
                      defaultValue={String(field.value)}
                      disabled={pumpIsRunning}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pump" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Counter clock wise</SelectItem>
                        <SelectItem value="true">Clock wise</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.direction && <p role="alert">{errors.direction?.message}</p>}
              </div>
            </div>

            <div className="flex flex-row gap-4">
              <div className="mb-4 w-[50%]">
                <div className="text-gray-500 pb-1">
                  <label>Speed [rpm]</label>
                </div>
                <Input
                  type="number"
                  placeholder="RPM"
                  step="0.1"
                  min="0.1"
                  max={String(maxRpm)}
                  defaultValue={1}
                  disabled={pumpIsRunning}
                  {...register('speed', { valueAsNumber: true })}
                />
                <p className="pt-1 text-xs text-muted-foreground">Max {maxRpm} RPM from board configuration.</p>
                {errors.speed && <p role="alert">{errors.speed?.message}</p>}
              </div>

              <div className="mb-4 w-[50%]">
                <div className="text-gray-500 pb-1">
                  <label>Working time [min]</label>
                </div>
                <Input
                  type="number"
                  placeholder="minutes"
                  step="1"
                  defaultValue={1}
                  disabled={pumpIsRunning}
                  {...register('time', { valueAsNumber: true })}
                />
                {errors.time && <p role="alert">{errors.time?.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit" className="w-full sm:flex-1" variant="default" disabled={pumpIsRunning || speed > maxRpm}>
                <LoaderCircle className="hidden animate-spin data-[visible=true]:block" data-visible="false" />
                Run {selectedPumpName}
              </Button>
              <Button
                type="button"
                className="w-full sm:flex-1"
                variant="destructive"
                disabled={!selectedActiveRun}
                onClick={emergencyStop}
              >
                <Square data-icon="inline-start" />
                Emergency Stop
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
