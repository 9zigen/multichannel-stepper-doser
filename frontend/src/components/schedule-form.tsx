import React from 'react';
import { Controller, ControllerRenderProps, SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, CircleHelp, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { PumpCalibrationState, PumpState, ScheduleState, SCHEDULE_MODE } from '@/lib/api.ts';
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

const ScheduleForm = ({ pump, success }: ScheduleFormProps): React.ReactElement => {
  const updatePump = useAppStore((state: AppStoreState) => state.updatePump);
  const [showHelp, setShowHelp] = React.useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors },
    watch,
    reset,
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

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    const nextPump: PumpState = {
      ...pump,
      ...data,
      aging: pump.aging,
    };

    if (await updatePump(nextPump, true)) {
      reset(data);
      toast.success('Schedule settings saved.');
      success?.();
      return;
    }

    toast.error('Schedule settings not saved.');
  };

  return (
    <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-3">
        {/* Mode selector */}
        <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Mode</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {modeActual === SCHEDULE_MODE.PERIODIC && (
                <>
                  <Badge variant="outline" className="text-[10px] tabular-nums">{formatVolumePerDay(selectedVolume)}</Badge>
                  <Badge variant="outline" className="text-[10px] tabular-nums">{formatRpm(selectedSpeed)}</Badge>
                  <Badge variant="outline" className="text-[10px] tabular-nums">{formatDaysCount(selectedWeekdays)} · {formatHoursCount(selectedHours)}</Badge>
                </>
              )}
              {modeActual === SCHEDULE_MODE.CONTINUOUS && (
                <Badge variant="outline" className="text-[10px] tabular-nums">{formatRpm(selectedSpeed)}</Badge>
              )}
            </div>
          </div>

          <Controller
            name="schedule.mode"
            control={control}
            render={({ field }) => (
              <ToggleGroup
                type="single"
                spacing={3}
                className="grid w-full grid-cols-3"
                value={String(field.value)}
                onValueChange={(value) => {
                  if (value !== '') {
                    field.onChange(Number(value));
                  }
                }}
              >
                {Object.entries(scheduleModeMeta).map(([value, meta]) => {
                  const selected = field.value === Number(value);
                  return (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className={cn(
                        'h-8 rounded-md border border-transparent px-2 text-sm font-medium shadow-none transition-all',
                        'flex items-center gap-1.5 hover:bg-secondary/25',
                        selected
                          ? 'border-primary/30 bg-primary/10 text-primary shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                          : 'text-foreground/80',
                      )}
                    >
                      <meta.icon className="size-3.5 shrink-0" />
                      <span>{meta.label}</span>
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            )}
          />

          {modeActual === SCHEDULE_MODE.OFF && (
            <p className="mt-2 text-xs text-muted-foreground">
              Automatic dosing is disabled. Manual control remains available.
            </p>
          )}
        </div>

        {/* Output target */}
        {modeActual !== SCHEDULE_MODE.OFF && (
          <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Output target</span>
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
                    step="0.1"
                    className="h-8 text-sm tabular-nums"
                    {...register('schedule.volume', { valueAsNumber: true })}
                    aria-invalid={!!errors.schedule?.volume}
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
          </div>
        )}

        {/* Timing rules — compact */}
        {modeActual === SCHEDULE_MODE.PERIODIC && (
          <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
            <span className="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  <span className="text-[10px] tabular-nums text-muted-foreground/60">
                    {selectedHours.length}/24
                  </span>
                </div>
                <Controller
                  name="schedule.work_hours"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 xl:grid-cols-12">
                      {hours.map((hour) => (
                        <Toggle
                          key={hour}
                          size="sm"
                          pressed={field.value.includes(hour)}
                          onClick={() => toggleHour(field, hour)}
                          className="h-7 rounded-md px-0 text-xs tabular-nums"
                        >
                          {String(hour).padStart(2, '0')}
                        </Toggle>
                      ))}
                    </div>
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!isDirty}>
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
