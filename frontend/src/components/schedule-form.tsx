import React from 'react';
import { Controller, ControllerRenderProps, SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Clock3, LoaderCircle, Repeat } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button.tsx';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input.tsx';
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

const SummaryRow = ({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}): React.ReactElement => (
  <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-1">
    <div className="text-sm leading-6 text-muted-foreground">{label}</div>
    <div className="justify-self-end text-sm font-medium tabular-nums leading-6 text-foreground">{value}</div>
  </div>
);

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
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ScheduleForm = ({ pump, success }: ScheduleFormProps): React.ReactElement => {
  const updatePump = useAppStore((state: AppStoreState) => state.updatePump);

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
  const modeDetails = scheduleModeMeta[modeActual];
  const selectedHours = watch('schedule.work_hours');
  const selectedWeekdays = watch('schedule.weekdays');
  const selectedSpeed = watch('schedule.speed');
  const selectedVolume = watch('schedule.volume');

  const toggleHour = (field: ControllerRenderProps<FormData, 'schedule.work_hours'>, hour: number) => {
    const value = field.value.includes(hour)
      ? field.value.filter((item: number) => item !== hour)
      : [...field.value, hour];
    field.onChange(value.sort((a, b) => a - b));
  };

  const toggleDay = (field: ControllerRenderProps<FormData, 'schedule.weekdays'>, dayIndex: number) => {
    const value = field.value.includes(dayIndex)
      ? field.value.filter((item: number) => item !== dayIndex)
      : [...field.value, dayIndex];
    field.onChange(value.sort((a, b) => a - b));
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
      <FieldGroup className="gap-3">
        <section className="-mx-4 rounded-xl border border-border/30 bg-secondary/10 px-4 py-3">
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-background shadow-xs">
                <modeDetails.icon className="text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <FieldTitle className="text-base">Schedule mode</FieldTitle>
                <FieldDescription>{modeDetails.description}</FieldDescription>
              </div>
            </div>
            <div className="grid gap-1.5">
              <SummaryRow label="Mode" value={<Badge variant={modeDetails.badgeVariant}>{modeDetails.label}</Badge>} />
              {modeActual === SCHEDULE_MODE.PERIODIC ? (
                <>
                  <SummaryRow label="Daily target" value={formatVolumePerDay(selectedVolume)} />
                  <SummaryRow label="Speed" value={formatRpm(selectedSpeed)} />
                  <SummaryRow label="Cadence" value={`${formatDaysCount(selectedWeekdays)} • ${formatHoursCount(selectedHours)}`} />
                </>
              ) : null}
              {modeActual === SCHEDULE_MODE.CONTINUOUS ? <SummaryRow label="Speed" value={formatRpm(selectedSpeed)} /> : null}
            </div>
          </div>

          <Controller
            name="schedule.mode"
            control={control}
            render={({ field }) => (
              <div className="rounded-lg border border-border/30 bg-secondary/20 p-1">
                <ToggleGroup
                  type="single"
                  spacing={3}
                  className="grid w-full grid-cols-1 sm:grid-cols-3"
                  value={String(field.value)}
                  onValueChange={(value) => {
                    if (value !== '') {
                      field.onChange(Number(value));
                    }
                  }}
                >
                  {Object.entries(scheduleModeMeta).map(([value, meta], index) => {
                    const selected = field.value === Number(value);

                    return (
                      <ToggleGroupItem
                        key={value}
                        value={value}
                        style={{ animationDelay: `${index * 50}ms` }}
                        className={cn(
                          'animate-fade-in-up',
                          'h-9 rounded-md border border-transparent px-3 py-2 text-sm font-medium shadow-none transition-all',
                          'flex items-center gap-2 hover:bg-secondary/25',
                          selected
                            ? 'border-primary/30 bg-primary/10 text-primary shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                            : 'text-foreground/80'
                        )}
                      >
                        <meta.icon className="size-3.5 shrink-0" />
                        <span>{meta.label}</span>
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </div>
            )}
          />
        </section>

        {modeActual === SCHEDULE_MODE.OFF ? (
          <Alert>
            <Clock3 />
            <AlertTitle>Automatic dosing is disabled</AlertTitle>
            <AlertDescription>
              This pump stays available for manual control, but no schedule windows or continuous output will run until
              you switch modes.
            </AlertDescription>
          </Alert>
        ) : null}

        {modeActual !== SCHEDULE_MODE.OFF ? (
          <section className="-mx-4 rounded-xl border border-border/30 bg-secondary/10 px-4 py-3">
            <FieldSet className="gap-3">
              <div className="flex flex-col gap-1">
                <FieldLegend>Output target</FieldLegend>
                <FieldDescription>
                  {modeActual === SCHEDULE_MODE.CONTINUOUS
                    ? 'Only the target speed matters in continuous mode.'
                    : 'Define the speed and total daily dose before adjusting the timing windows.'}
                </FieldDescription>
              </div>

              <FieldGroup className={cn('gap-3', modeActual === SCHEDULE_MODE.PERIODIC ? 'md:grid md:grid-cols-2' : undefined)}>
                <Field>
                  <FieldLabel htmlFor={`speed-${pump.id}`}>Speed [rpm]</FieldLabel>
                  <FieldContent>
                    <Input
                      id={`speed-${pump.id}`}
                      type="number"
                      placeholder="1"
                      min="0.1"
                      step="0.1"
                      {...register('schedule.speed', { valueAsNumber: true })}
                      aria-invalid={!!errors.schedule?.speed}
                    />
                    <FieldDescription>
                      {modeActual === SCHEDULE_MODE.CONTINUOUS
                        ? 'Target motor speed while the pump remains in continuous mode.'
                        : 'Target speed used during the scheduled dosing windows.'}
                    </FieldDescription>
                    <FieldError errors={[errors.schedule?.speed]} />
                  </FieldContent>
                </Field>

                {modeActual === SCHEDULE_MODE.PERIODIC ? (
                  <Field>
                    <FieldLabel htmlFor={`volume-${pump.id}`}>Daily volume [ml]</FieldLabel>
                    <FieldContent>
                      <Input
                        id={`volume-${pump.id}`}
                        type="number"
                        placeholder="10"
                        min="0.1"
                        step="0.1"
                        {...register('schedule.volume', { valueAsNumber: true })}
                        aria-invalid={!!errors.schedule?.volume}
                      />
                      <FieldDescription>Total target volume distributed across the selected schedule.</FieldDescription>
                      <FieldError errors={[errors.schedule?.volume]} />
                    </FieldContent>
                  </Field>
                ) : null}
              </FieldGroup>
            </FieldSet>
          </section>
        ) : null}

        {modeActual === SCHEDULE_MODE.PERIODIC ? (
          <section className="-mx-4 rounded-xl border border-border/30 bg-secondary/10 px-4 py-3">
            <div className="mb-3 flex items-center gap-2">
              <Repeat className="size-4 text-primary" />
              <FieldTitle className="text-base">Timing rules</FieldTitle>
            </div>

            <FieldGroup className="gap-3">
              <FieldSet className="gap-3">
                <div className="flex flex-col gap-1">
                  <FieldLegend>Weekdays</FieldLegend>
                  <FieldDescription>Limit dosing to the weekdays that match your routine.</FieldDescription>
                </div>
                <Controller
                  name="schedule.weekdays"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                      {weekdays.map((day, index) => (
                        <Toggle
                          key={day}
                          pressed={field.value.includes(index)}
                          onClick={() => toggleDay(field, index)}
                          className="animate-fade-in-up h-10 rounded-xl text-sm"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          {day}
                        </Toggle>
                      ))}
                    </div>
                  )}
                />
              </FieldSet>

              <FieldSet className="gap-3">
                <div className="flex flex-col gap-1">
                  <FieldLegend>Hours</FieldLegend>
                  <FieldDescription>Choose the hours when this pump is allowed to dose.</FieldDescription>
                </div>
                <Controller
                  name="schedule.work_hours"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-8">
                      {hours.map((hour, index) => (
                        <Toggle
                          key={hour}
                          pressed={field.value.includes(hour)}
                          onClick={() => toggleHour(field, hour)}
                          className="animate-fade-in-up h-10 rounded-xl text-sm"
                          style={{ animationDelay: `${index * 20}ms` }}
                        >
                          {String(hour).padStart(2, '0')}
                        </Toggle>
                      ))}
                    </div>
                  )}
                />
              </FieldSet>
            </FieldGroup>
          </section>
        ) : null}

        <Button type="submit" className="w-full md:w-auto md:self-end" size="lg" disabled={!isDirty}>
          {isSubmitting ? (
            <>
              <LoaderCircle className="animate-spin" data-icon="inline-start" /> Saving
            </>
          ) : (
            <>
              <Check data-icon="inline-start" /> Apply schedule
            </>
          )}
        </Button>
      </FieldGroup>
    </form>
  );
};

export default ScheduleForm;
