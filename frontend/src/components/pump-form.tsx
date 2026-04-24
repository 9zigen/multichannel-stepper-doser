import React, { useEffect, useState } from 'react';

import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Input } from '@/components/ui/input.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

import { PumpCalibrationState, PumpState, ScheduleState } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { toast } from 'sonner';
import PumpCalibration from '@/components/pump-calibration.tsx';
import { CalibrationQualityChart } from '@/components/calibration-quality-chart.tsx';
import { Check, FlaskConical, LoaderCircle, ShieldCheck, Square } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { usePumpRuntime } from '@/components/pump-runtime-provider.tsx';

type FormData = {
  id: number;
  state: boolean;
  name: string;
  direction: boolean;
  running_hours: number;
  tank_full_vol: number;
  tank_current_vol: number;
  tank_concentration_total: number;
  tank_concentration_active: number;
  max_single_run_ml: number;
  max_single_run_seconds: number;
  max_hourly_ml: number;
  max_daily_ml: number;
  schedule: ScheduleState;
  calibration: PumpCalibrationState[];
};

const FormSchema = z.object({
  id: z.number(),
  state: z.boolean(),
  name: z.string(),
  direction: z.boolean(),
  running_hours: z.number(),
  tank_full_vol: z.number(),
  tank_current_vol: z.number(),
  tank_concentration_total: z.number(),
  tank_concentration_active: z.number(),
  max_single_run_ml: z.number().min(0, 'Must be 0 or greater'),
  max_single_run_seconds: z.number().min(0, 'Must be 0 or greater'),
  max_hourly_ml: z.number().min(0, 'Must be 0 or greater'),
  max_daily_ml: z.number().min(0, 'Must be 0 or greater'),
  calibration: z.array(z.object({ speed: z.number(), flow: z.number() })),
  schedule: z.object({
    mode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    work_hours: z.array(z.number()),
    weekdays: z.array(z.number()),
    speed: z.number(),
    time: z.number(),
    volume: z.number(),
  }),
});

export interface PumpFormProps {
  pump: PumpState;
  success?: () => void;
}

const PumpForm = ({ pump, success }: PumpFormProps): React.ReactElement => {
  const {
    id,
    state,
    name,
    direction,
    running_hours,
    tank_full_vol,
    tank_current_vol,
    tank_concentration_total,
    tank_concentration_active,
    max_single_run_ml = 0,
    max_single_run_seconds = 0,
    max_hourly_ml = 0,
    max_daily_ml = 0,
    schedule,
    calibration,
  } = pump;
  const updatePump = useAppStore((state: AppStoreState) => state.updatePump);
  const { runtime, stopCalibrationSession } = usePumpRuntime();

  const {
    control,
    register,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors },
    setError,
    clearErrors,
    setValue,
    watch,
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: id,
      state: state,
      name: name,
      direction: direction,
      running_hours: running_hours,
      tank_full_vol: tank_full_vol,
      tank_current_vol: tank_current_vol,
      tank_concentration_total: tank_concentration_total,
      tank_concentration_active: tank_concentration_active,
      max_single_run_ml: max_single_run_ml,
      max_single_run_seconds: max_single_run_seconds,
      max_hourly_ml: max_hourly_ml,
      max_daily_ml: max_daily_ml,
      schedule: schedule,
      calibration: calibration,
    },
  });

  const [pumpCalibrations, setPumpCalibrations] = useState(calibration);
  const [calibrationChanged, setCalibrationChanged] = useState(false);

  const direction_actual = watch('direction');
  const unsaved = isDirty || calibrationChanged;
  const activeCalibration = runtime.find((entry) => entry.id === id && entry.state === 'calibration') ?? null;

  useEffect(() => {
    setPumpCalibrations(calibration);
    setValue('calibration', calibration);
    if (calibration.length) {
      clearErrors('calibration');
    }
  }, [calibration]);

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (!data.calibration.length) {
      setError('calibration', { message: 'Minimum one calibration is required.' });
      return;
    }

    const nextPump: PumpState = {
      ...pump,
      ...data,
      aging: pump.aging,
    };

    if (await updatePump(nextPump, true)) {
      reset(data);
      setCalibrationChanged(false);
      toast.success('Pumps settings saved.');
      if (success) {
        success();
      }
    } else {
      toast.error('Pumps settings not saved.');
    }
  };

  const updateCalibrationData = async (data: PumpCalibrationState[]) => {
    try {
      await updatePump({ ...pump, calibration: data }, false);
      setCalibrationChanged(true);
      toast.success('Pump calibration updated. Please save the pump settings to apply the changes.');
    } catch (e) {
      const error = e as Error;
      toast.error(error.message);
    }
  };
  const removeCalibration = async (index: number) => {
    const newCalibrations = pumpCalibrations.filter((_item, idx) => idx !== index);
    await updateCalibrationData(newCalibrations);
  };

  const addCalibration = async (cal: PumpCalibrationState) => {
    const newCalibrations = [...pumpCalibrations, cal];
    await updateCalibrationData(newCalibrations);
  };

  return (
    <React.Fragment>
      <ScrollArea className="w-full p-2">
        <div className="flex flex-col xl:flex-row xl:gap-6 p-2">
          <form
            id="pump-form"
            className="flex flex-col xl:w-[50%]"
            onSubmit={handleSubmit(onSubmit, (errors) => console.log(errors))}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor="pump-name" className="text-xs text-muted-foreground">Name</Label>
                <Input id="pump-name" type="text" placeholder="Name" className="h-8 text-sm" {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="flex flex-col items-center gap-1 pt-3">
                <Label htmlFor="pump-direction" className="text-xs text-muted-foreground">{direction_actual ? 'CW' : 'CCW'}</Label>
                <Controller
                  name="direction"
                  control={control}
                  render={({ field }) => (
                    <Switch id="pump-direction" checked={field.value} onCheckedChange={(v) => field.onChange(Boolean(v))} />
                  )}
                />
              </div>
              <div className="flex flex-col items-center gap-1 pt-3">
                <Label htmlFor="pump-state" className="text-xs text-muted-foreground">Enabled</Label>
                <Controller
                  name="state"
                  control={control}
                  render={({ field }) => (
                    <Switch id="pump-state" checked={field.value} onCheckedChange={(v) => field.onChange(Boolean(v))} />
                  )}
                />
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="tank-full" className="text-xs text-muted-foreground">Tank full vol</Label>
                <Input id="tank-full" type="number" placeholder="900" className="h-8 text-sm tabular-nums" {...register('tank_full_vol', { valueAsNumber: true })} />
                {errors.tank_full_vol && <p className="text-xs text-destructive">{errors.tank_full_vol.message}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="tank-current" className="text-xs text-muted-foreground">Tank current vol</Label>
                <Input id="tank-current" type="number" placeholder="900" className="h-8 text-sm tabular-nums" {...register('tank_current_vol', { valueAsNumber: true })} />
                {errors.tank_current_vol && <p className="text-xs text-destructive">{errors.tank_current_vol.message}</p>}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="conc-total" className="text-xs text-muted-foreground">Solution conc.</Label>
                <Input id="conc-total" type="number" placeholder="20" className="h-8 text-sm tabular-nums" {...register('tank_concentration_total', { valueAsNumber: true })} />
                {errors.tank_concentration_total && <p className="text-xs text-destructive">{errors.tank_concentration_total.message}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="conc-active" className="text-xs text-muted-foreground">Element conc.</Label>
                <Input id="conc-active" type="number" placeholder="10" className="h-8 text-sm tabular-nums" {...register('tank_concentration_active', { valueAsNumber: true })} />
                {errors.tank_concentration_active && <p className="text-xs text-destructive">{errors.tank_concentration_active.message}</p>}
              </div>
            </div>

            <div className="mb-4 rounded-md border border-border/40 bg-secondary/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Safety limits</span>
                </div>
                <span className="text-xs text-muted-foreground">0 disables</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="max-single-run-ml" className="text-xs text-muted-foreground">Single dose ml</Label>
                  <Input id="max-single-run-ml" type="number" min={0} step={1} className="h-8 text-sm tabular-nums" {...register('max_single_run_ml', { valueAsNumber: true })} />
                  {errors.max_single_run_ml && <p className="text-xs text-destructive">{errors.max_single_run_ml.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="max-single-run-seconds" className="text-xs text-muted-foreground">Runtime sec</Label>
                  <Input id="max-single-run-seconds" type="number" min={0} step={1} className="h-8 text-sm tabular-nums" {...register('max_single_run_seconds', { valueAsNumber: true })} />
                  {errors.max_single_run_seconds && <p className="text-xs text-destructive">{errors.max_single_run_seconds.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="max-hourly-ml" className="text-xs text-muted-foreground">Hourly ml</Label>
                  <Input id="max-hourly-ml" type="number" min={0} step={1} className="h-8 text-sm tabular-nums" {...register('max_hourly_ml', { valueAsNumber: true })} />
                  {errors.max_hourly_ml && <p className="text-xs text-destructive">{errors.max_hourly_ml.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="max-daily-ml" className="text-xs text-muted-foreground">Daily ml</Label>
                  <Input id="max-daily-ml" type="number" min={0} step={1} className="h-8 text-sm tabular-nums" {...register('max_daily_ml', { valueAsNumber: true })} />
                  {errors.max_daily_ml && <p className="text-xs text-destructive">{errors.max_daily_ml.message}</p>}
                </div>
              </div>
            </div>
          </form>

          <div className="flex flex-col xl:w-[50%]">
            {activeCalibration ? (
              <Alert className="mb-4 border-amber-500/25 bg-amber-500/8">
                <FlaskConical className="size-4" />
                <AlertTitle>Calibration in progress</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>The motor is still running for this pump. You can continue or stop it here.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={async () => {
                      const success = await stopCalibrationSession(id);
                      if (success) {
                        toast.success(`${name} calibration stopped.`);
                      } else {
                        toast.error('Failed to stop calibration.');
                      }
                    }}
                  >
                    <Square className="size-4" />
                    Stop
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            <CalibrationQualityChart points={pumpCalibrations} />
            <PumpCalibration pump={{ ...pump, calibration: pumpCalibrations }} success={(cal) => addCalibration(cal)} />
            {errors.calibration && (
              <p role="alert" className="text-xs text-destructive">
                {errors.calibration?.message}
              </p>
            )}
            {pumpCalibrations.map((item, index) => (
              <div key={index} className="animate-fade-in-up mb-2 flex items-center justify-between gap-3 rounded-md bg-secondary/20 px-3 py-2" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Speed </span>
                    <span className="tabular-nums font-medium">{item.speed} RPM</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Flow </span>
                    <span className="tabular-nums font-medium">{item.flow} ml/min</span>
                  </div>
                </div>
                <Button type="button" variant="destructive" size="sm" onClick={() => removeCalibration(index)}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="flex flex-row">
        <Button size="icon" type="submit" className="w-full" disabled={!unsaved} form="pump-form">
          {isSubmitting ? (
            <>
              <LoaderCircle size={20} className="animate-spin" /> Saving
            </>
          ) : (
            <>
              <Check size={20} /> Apply
            </>
          )}
        </Button>
      </div>
    </React.Fragment>
  );
};

export default PumpForm;
