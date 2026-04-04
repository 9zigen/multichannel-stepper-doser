import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { z } from 'zod';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PumpRunResponse, runPump } from '@/lib/api.ts';
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { AlertTriangle, Square } from 'lucide-react';

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

export default function PumpControl(props: PumpControlProps) {
  const { pumps } = props;
  const [activeRun, setActiveRun] = React.useState<{
    pumpId: number;
    pumpName: string;
    speed: number;
    time: number;
  } | null>(null);
  const runTimeoutRef = React.useRef<number | null>(null);
  const {
    control,
    register,
    handleSubmit,
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

  React.useEffect(() => {
    return () => {
      if (runTimeoutRef.current !== null) {
        window.clearTimeout(runTimeoutRef.current);
      }
    };
  }, []);

  const pumpId = watch('pump_id');
  const pumpIsRunning = activeRun !== null;
  const selectedPumpName = pumps.find((pump) => pump.id === pumpId)?.name ?? 'Selected pump';

  const clearRunningState = () => {
    if (runTimeoutRef.current !== null) {
      window.clearTimeout(runTimeoutRef.current);
      runTimeoutRef.current = null;
    }
    setActiveRun(null);
  };

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      const action = {
        id: data.pump_id,
        direction: data.direction,
        speed: data.speed,
        time: data.time,
      };
      const response = (await runPump(action)) as PumpRunResponse;
      if (response.success) {
        toast.success('Pump started.');
        const pumpName = pumps.find((pump) => pump.id === data.pump_id)?.name ?? `Pump ${data.pump_id}`;
        setActiveRun({
          pumpId: data.pump_id,
          pumpName,
          speed: data.speed,
          time: data.time,
        });
        runTimeoutRef.current = window.setTimeout(
          () => {
            setActiveRun((current) => {
              if (current?.pumpId === data.pump_id) {
                toast.success(`${pumpName} finished in ${data.time} min at ${data.speed} rpm.`);
                return null;
              }
              return current;
            });
            runTimeoutRef.current = null;
          },
          data.time * 60 * 1000
        );
      } else {
        toast.error('Pump failed.');
      }
    } catch (e) {
      toast.error('Pump failed.');
      console.error(e);
    }
  };

  const emergencyStop = async () => {
    if (activeRun === null) {
      return;
    }

    try {
      const response = (await runPump({
        id: activeRun.pumpId,
        direction: true,
        speed: activeRun.speed,
        time: 0,
      })) as PumpRunResponse;

      if (response.success) {
        clearRunningState();
        toast.error(`${activeRun.pumpName} stopped.`);
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
    <Card className="w-full shadow-none">
      <CardHeader>
        <CardTitle>Pump Control</CardTitle>
        <CardDescription>Manual control of pumps with immediate emergency stop support.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {activeRun ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-4" />
                Manual run active
              </div>
              <div className="text-muted-foreground">
                {activeRun.pumpName} is running at {activeRun.speed} rpm for up to {activeRun.time} min.
              </div>
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
                        {pumps.map((x, index) => {
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
                  defaultValue={1}
                  disabled={pumpIsRunning}
                  {...register('speed', { valueAsNumber: true })}
                />
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

            <div className="flex flex-row gap-3">
              <Button type="submit" className="w-full" variant="default" disabled={pumpIsRunning}>
                Run {selectedPumpName}
              </Button>
              <Button
                type="button"
                className="w-full"
                variant="destructive"
                disabled={!pumpIsRunning}
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
