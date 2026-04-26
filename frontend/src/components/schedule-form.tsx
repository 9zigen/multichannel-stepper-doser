import React from 'react';
import { Controller, ControllerRenderProps, SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Check, CircleHelp, LoaderCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import {
  PumpCalibrationState,
  PumpHistoryResetResponse,
  PumpState,
  resetPumpsHistoryTodayScheduled,
  ScheduleState,
  SCHEDULE_MODE,
} from '@/lib/api.ts';
import {
  formatDaysCount,
  formatHoursCount,
  formatRpm,
  formatVolumePerDay,
  scheduleModeMeta,
} from '@/components/schedule-utils';

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

type ScheduleFormProps = {
  pump: PumpState;
  success?: () => void;
};

const hours = Array.from(Array(24).keys());
const weekdayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const formatHourLabel = (hour: number, use12h: boolean): string => {
  if (!use12h) return String(hour).padStart(2, '0');
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
};
const MIN_CALIBRATION_FLOW_ML_PER_MIN = 0.01;
const LIMIT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const COMPACT_VOLUME_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const formatLimitNumber = (value: number) => LIMIT_NUMBER_FORMATTER.format(value);

const formatCompactDoseVolume = (volumeMl: number) => {
  if (!Number.isFinite(volumeMl) || volumeMl <= 0) {
    return '0ml';
  }

  if (volumeMl < 0.01) {
    return '<0.01ml';
  }

  if (volumeMl <= 999) {
    return `${COMPACT_VOLUME_FORMATTER.format(volumeMl)}ml`;
  }

  const volumeL = volumeMl / 1000;
  if (volumeL > 999) {
    return '>999L';
  }

  return `${COMPACT_VOLUME_FORMATTER.format(volumeL)}L`;
};

const estimateFlowMlPerMin = (calibration: PumpCalibrationState[], rpm: number) => {
  if (!Number.isFinite(rpm) || rpm <= 0) {
    return 0;
  }

  const points = calibration
    .filter((point) => point.speed > 0 && point.flow >= MIN_CALIBRATION_FLOW_ML_PER_MIN)
    .sort((left, right) => left.speed - right.speed);

  if (points.length === 0) {
    return 0;
  }

  if (points.length === 1 || rpm <= points[0].speed) {
    return points[0].flow;
  }

  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (rpm > right.speed) {
      continue;
    }

    const left = points[index - 1];
    if (right.speed <= left.speed) {
      return right.flow;
    }

    const ratio = (rpm - left.speed) / (right.speed - left.speed);
    return left.flow + (right.flow - left.flow) * ratio;
  }

  return points[points.length - 1].flow;
};

const ScheduleForm = ({ pump, success }: ScheduleFormProps): React.ReactElement => {
  const updatePump = useAppStore((state: AppStoreState) => state.updatePump);
  const [showHelp, setShowHelp] = React.useState(false);
  const [use12h, setUse12h] = React.useState<boolean>(() => {
    try { return localStorage.getItem('ui-hours-format') === '12h'; } catch { return false; }
  });

  const toggleHourFormat = () => {
    setUse12h((v) => {
      const next = !v;
      try { localStorage.setItem('ui-hours-format', next ? '12h' : '24h'); } catch { /* ignore */ }
      return next;
    });
  };

  const {
    control,
    register,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors },
    watch,
    reset,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: pump.id,
      state: pump.state,
      name: pump.name,
      direction: pump.direction,
      running_hours: pump.running_hours,
      tank_full_vol: pump.tank_full_vol,
      tank_current_vol: pump.tank_current_vol,
      tank_concentration_total: pump.tank_concentration_total,
      tank_concentration_active: pump.tank_concentration_active,
      schedule: pump.schedule,
      calibration: pump.calibration,
    },
  });

  const modeActual = watch('schedule.mode');
  const selectedHours = watch('schedule.work_hours');
  const selectedWeekdays = watch('schedule.weekdays');
  const selectedSpeed = watch('schedule.speed');
  const selectedVolume = watch('schedule.volume');
  const volumePerActiveHour =
    selectedHours.length > 0 && Number.isFinite(selectedVolume) ? selectedVolume / selectedHours.length : 0;
  const volumePerActiveHourLabel = formatCompactDoseVolume(volumePerActiveHour);

  const dosingCapacity = React.useMemo(() => {
    if (modeActual !== SCHEDULE_MODE.PERIODIC) {
      return null;
    }

    const flowMlPerMin = estimateFlowMlPerMin(pump.calibration, selectedSpeed);
    const activeHours = selectedHours.length;
    const maxDailyVolume = flowMlPerMin * 60 * activeHours;
    const requestedVolume = Number.isFinite(selectedVolume) ? selectedVolume : 0;

    return {
      activeHours,
      flowMlPerMin,
      maxDailyVolume,
      missingCalibration: requestedVolume > 0 && flowMlPerMin <= 0,
      unreachable: requestedVolume > maxDailyVolume && requestedVolume > 0,
    };
  }, [modeActual, pump.calibration, selectedHours.length, selectedSpeed, selectedVolume]);

  const scheduleNotReachable = dosingCapacity?.unreachable ?? false;
  const scheduleMissingCalibration = dosingCapacity?.missingCalibration ?? false;

  const clampDailyVolumeToCapacity = () => {
    if (!dosingCapacity || dosingCapacity.maxDailyVolume <= 0) {
      return;
    }

    const limitedVolume = Number(dosingCapacity.maxDailyVolume.toFixed(2));
    setValue('schedule.volume', limitedVolume, { shouldDirty: true, shouldValidate: true });
  };

  const toggleHour = (field: ControllerRenderProps<FormData, 'schedule.work_hours'>, hour: number) => {
    const value = field.value.includes(hour)
      ? field.value.filter((item: number) => item !== hour)
      : [...field.value, hour];
    field.onChange(value.sort((a: number, b: number) => a - b));
  };

  const toggleDay = (field: ControllerRenderProps<FormData, 'schedule.weekdays'>, dayIndex: number) => {
    const value = field.value.includes(dayIndex)
      ? field.value.filter((item: number) => item !== dayIndex)
      : [...field.value, dayIndex];
    field.onChange(value.sort((a: number, b: number) => a - b));
  };

  const saveSchedule = async (data: FormData, resetTodayHistory: boolean) => {
    const nextPump: PumpState = {
      ...pump,
      ...data,
      aging: pump.aging,
    };

    if (await updatePump(nextPump, true)) {
      if (resetTodayHistory) {
        try {
          await resetPumpsHistoryTodayScheduled<PumpHistoryResetResponse>(pump.id);
          toast.success("Schedule saved and today's scheduled history reset.");
        } catch (error) {
          console.error(error);
          toast.error('Schedule saved, but scheduled history reset failed.');
        }
      } else {
        toast.success('Schedule settings saved.');
      }
      reset(data);
      success?.();
      return;
    }

    toast.error('Schedule settings not saved.');
  };

  const onSubmit: SubmitHandler<FormData> = async (data) => saveSchedule(data, false);

  const saveAndResetTodayHistory = () => {
    void handleSubmit((data) => saveSchedule(data, true))();
  };

  return (
    <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-6">
        {/* Mode selector */}
        <div>
          <span className="mb-2.5 block text-[10px] uppercase tracking-wider text-muted-foreground/60">Mode</span>

          <Controller
            name="schedule.mode"
            control={control}
            render={({ field }) => (
              <div className="grid w-full grid-cols-3 gap-2">
                {Object.entries(scheduleModeMeta).map(([value, meta]) => {
                  const selected = field.value === Number(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => field.onChange(Number(value))}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border py-3 transition-all',
                        selected
                          ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_rgba(34,211,238,0.12)]'
                          : 'border-border/40 bg-secondary/5 text-muted-foreground hover:border-border/70 hover:bg-secondary/15 hover:text-foreground',
                      )}
                    >
                      <meta.icon className="size-5 shrink-0" />
                      <span className="text-[11px] font-medium leading-none">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          />

          <p className="mt-2.5 text-xs leading-snug text-muted-foreground">
            {scheduleModeMeta[modeActual].description}
          </p>

          {(modeActual === SCHEDULE_MODE.PERIODIC || modeActual === SCHEDULE_MODE.CONTINUOUS) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {modeActual === SCHEDULE_MODE.PERIODIC && (
                <>
                  <Badge variant="outline" className="text-[10px] tabular-nums border-primary/30 bg-primary/5 text-primary">
                    {formatVolumePerDay(selectedVolume)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {formatRpm(selectedSpeed)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {formatDaysCount(selectedWeekdays)} · {formatHoursCount(selectedHours)}
                  </Badge>
                </>
              )}
              {modeActual === SCHEDULE_MODE.CONTINUOUS && (
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {formatRpm(selectedSpeed)}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Output target */}
        {modeActual !== SCHEDULE_MODE.OFF && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Output target</span>
              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                className={cn(
                  'rounded-full p-0.5 transition-colors',
                  showHelp ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground',
                )}
                aria-label="Toggle field descriptions"
              >
                <CircleHelp className="size-3.5" />
              </button>
            </div>

            <div className={cn('grid gap-3', modeActual === SCHEDULE_MODE.PERIODIC ? 'sm:grid-cols-2' : '')}>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`speed-${pump.id}`} className="text-xs text-muted-foreground">
                  Speed [rpm]
                </Label>
                <Input
                  id={`speed-${pump.id}`}
                  type="number"
                  placeholder="1"
                  min="0.1"
                  step="0.1"
                  className="h-8 text-sm tabular-nums"
                  {...register('schedule.speed', { valueAsNumber: true })}
                  aria-invalid={!!errors.schedule?.speed}
                />
                <div
                  className={cn(
                    'grid transition-all duration-200',
                    showHelp ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <p className="overflow-hidden text-[11px] leading-tight text-muted-foreground">
                    {modeActual === SCHEDULE_MODE.CONTINUOUS
                      ? 'Target motor speed while in continuous mode.'
                      : 'Target speed used during scheduled dosing windows.'}
                  </p>
                </div>
                {errors.schedule?.speed && (
                  <p className="text-[11px] text-destructive">{errors.schedule.speed.message}</p>
                )}
              </div>

              {modeActual === SCHEDULE_MODE.PERIODIC && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`volume-${pump.id}`} className="text-xs text-muted-foreground">
                    Daily volume [ml]
                  </Label>
                  <Input
                    id={`volume-${pump.id}`}
                    type="number"
                    placeholder="10"
                    min="0.1"
                    max={
                      dosingCapacity && dosingCapacity.maxDailyVolume > 0
                        ? dosingCapacity.maxDailyVolume
                        : undefined
                    }
                    step="0.1"
                    className="h-8 text-sm tabular-nums"
                    {...register('schedule.volume', { valueAsNumber: true })}
                    aria-invalid={
                      !!errors.schedule?.volume || scheduleNotReachable || scheduleMissingCalibration
                    }
                  />
                  <div
                    className={cn(
                      'grid transition-all duration-200',
                      showHelp ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    )}
                  >
                    <p className="overflow-hidden text-[11px] leading-tight text-muted-foreground">
                      Total target volume distributed across the selected schedule.
                    </p>
                  </div>
                  {errors.schedule?.volume && (
                    <p className="text-[11px] text-destructive">{errors.schedule.volume.message}</p>
                  )}
                </div>
              )}
            </div>

            {modeActual === SCHEDULE_MODE.PERIODIC && dosingCapacity && (
              <div
                className={cn(
                  'mt-3 flex items-start gap-2 rounded-md border p-2 text-xs transition-colors',
                  scheduleMissingCalibration || scheduleNotReachable
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-900 dark:text-amber-200'
                    : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-900 dark:text-emerald-200',
                )}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <div className="min-w-0 space-y-1">
                  {scheduleMissingCalibration ? (
                    <p>
                      Calibration is required to estimate the reachable daily volume for scheduled dosing.
                    </p>
                  ) : scheduleNotReachable ? (
                    <>
                      <p>
                        Requested {formatLimitNumber(selectedVolume)} ml/day is not reachable at{' '}
                        {formatLimitNumber(selectedSpeed)} rpm with {dosingCapacity.activeHours} active hour
                        {dosingCapacity.activeHours === 1 ? '' : 's'}.
                      </p>
                      <p>
                        Estimated flow is {formatLimitNumber(dosingCapacity.flowMlPerMin)} ml/min, so this schedule can
                        dose up to {formatLimitNumber(dosingCapacity.maxDailyVolume)} ml/day. Increase speed, add active
                        hours, or lower the target.
                      </p>
                      {dosingCapacity.maxDailyVolume > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={clampDailyVolumeToCapacity}
                        >
                          Limit to {formatLimitNumber(dosingCapacity.maxDailyVolume)} ml/day
                        </Button>
                      )}
                    </>
                  ) : (
                    <p>
                      Estimated capacity: {formatLimitNumber(dosingCapacity.maxDailyVolume)} ml/day at{' '}
                      {formatLimitNumber(dosingCapacity.flowMlPerMin)} ml/min.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timing rules — compact */}
        {modeActual === SCHEDULE_MODE.PERIODIC && (
          <div>
            <span className="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Timing rules
            </span>

            <div className="flex flex-col gap-3">
              {/* Weekdays — always single row */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Weekdays</span>
                <Controller
                  name="schedule.weekdays"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-7 gap-1">
                      {weekdayLabels.map((day, index) => (
                        <Toggle
                          key={day}
                          size="sm"
                          pressed={field.value.includes(index)}
                          onClick={() => toggleDay(field, index)}
                          className="h-8 rounded-md px-0 text-xs"
                        >
                          {day}
                        </Toggle>
                      ))}
                    </div>
                  )}
                />
              </div>

              {/* Hours — compact grid */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Hours</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tabular-nums text-muted-foreground/60">
                      {selectedHours.length}/24
                    </span>
                    <button
                      type="button"
                      onClick={toggleHourFormat}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                        use12h
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground/60 hover:text-muted-foreground',
                      )}
                      aria-label="Toggle 12/24-hour format"
                    >
                      {use12h ? '12h' : '24h'}
                    </button>
                  </div>
                </div>
                <Controller
                  name="schedule.work_hours"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 xl:grid-cols-12">
                      {hours.map((hour) => {
                        const selected = field.value.includes(hour);

                        return (
                          <Toggle
                            key={hour}
                            size="sm"
                            pressed={selected}
                            onClick={() => toggleHour(field, hour)}
                            className={cn(
                              'rounded-md px-0 tabular-nums',
                              use12h ? 'text-[10px]' : 'text-xs',
                              selected ? 'h-10 flex-col gap-0.5' : 'h-7',
                            )}
                          >
                            <span>{formatHourLabel(hour, use12h)}</span>
                            {selected && (
                              <span className="text-[9px] font-semibold leading-none text-primary/80">
                                {volumePerActiveHourLabel}
                              </span>
                            )}
                          </Toggle>
                        );
                      })}
                    </div>
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/20 pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isDirty || isSubmitting || scheduleNotReachable || scheduleMissingCalibration}
              >
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <RotateCcw data-icon="inline-start" />
                )}
                Reset today + apply
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset today&apos;s scheduled history and apply?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will save the schedule changes for {pump.name}, clear today&apos;s scheduled dosing history,
                  and allow the current hour to dose again if the new schedule includes it. Manual dosing history is
                  preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={saveAndResetTodayHistory}
                  disabled={isSubmitting || scheduleNotReachable || scheduleMissingCalibration}
                >
                  {isSubmitting ? 'Applying...' : 'Reset today + apply'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            type="submit"
            size="sm"
            disabled={!isDirty || isSubmitting || scheduleNotReachable || scheduleMissingCalibration}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="animate-spin" data-icon="inline-start" /> Saving
              </>
            ) : (
              <>
                <Check data-icon="inline-start" /> Apply
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default ScheduleForm;
