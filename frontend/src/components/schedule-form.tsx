import React from 'react';
import { Controller, ControllerRenderProps, SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock, Check, Clock3, LoaderCircle, Repeat, Waves } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.tsx';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input.tsx';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { PumpCalibrationState, PumpState, ScheduleState, SCHEDULE_MODE } from '@/lib/api.ts';

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

const modeMeta = {
  [SCHEDULE_MODE.OFF]: {
    label: 'Off',
    description: 'Disable all automatic dosing for this pump.',
    icon: Clock3,
  },
  [SCHEDULE_MODE.PERIODIC]: {
    label: 'Periodic',
    description: 'Dose on selected weekdays and hours using a daily target volume.',
    icon: CalendarClock,
  },
  [SCHEDULE_MODE.CONTINUOUS]: {
    label: 'Continuous',
    description: 'Run at a constant speed until you switch the schedule mode.',
    icon: Waves,
  },
} as const;

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
  const modeDetails = modeMeta[modeActual];

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
      <FieldGroup className="gap-6">
        <section>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-background shadow-xs">
              <modeDetails.icon className="text-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <FieldTitle className="text-base">Schedule mode</FieldTitle>
              <FieldDescription>{modeDetails.description}</FieldDescription>
            </div>
          </div>

          <Controller
            name="schedule.mode"
            control={control}
            render={({ field }) => (
              <div className="rounded-[1.75rem] bg-foreground/6 p-1.5">
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
                  {Object.entries(modeMeta).map(([value, meta]) => {
                    const selected = field.value === Number(value);

                    return (
                      <ToggleGroupItem
                        key={value}
                        value={value}
                        className={cn(
                          'h-11 rounded-[1.35rem] border border-transparent bg-background/88 px-3 text-sm font-medium shadow-xs transition-all',
                          'hover:bg-background',
                          selected
                            ? 'border-primary/25 bg-primary text-primary shadow-sm'
                            : 'text-foreground/80'
                        )}
                      >
                        {meta.label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </div>
            )}
          />

        </section>

        {modeActual === SCHEDULE_MODE.PERIODIC ? (
          <section className="rounded-xl border border-border bg-card/85 p-4 shadow-sm dark:shadow-none">
            <div className="mb-4 flex items-center gap-2">
              <Repeat className="size-4 text-primary" />
              <FieldTitle className="text-base">Periodic timing</FieldTitle>
            </div>

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Hours</FieldLabel>
                <FieldContent>
                  <FieldDescription>Choose the hours when this pump is allowed to dose.</FieldDescription>
                  <Controller
                    name="schedule.work_hours"
                    control={control}
                    render={({ field }) => (
                      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                        {hours.map((hour) => (
                          <Toggle
                            key={hour}
                            pressed={field.value.includes(hour)}
                            onClick={() => toggleHour(field, hour)}
                            className="h-9 rounded-xl text-xs"
                          >
                            {hour}
                          </Toggle>
                        ))}
                      </div>
                    )}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>Weekdays</FieldLabel>
                <FieldContent>
                  <FieldDescription>Limit dosing to the weekdays that match your routine.</FieldDescription>
                  <Controller
                    name="schedule.weekdays"
                    control={control}
                    render={({ field }) => (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {weekdays.map((day, index) => (
                          <Toggle
                            key={day}
                            pressed={field.value.includes(index)}
                            onClick={() => toggleDay(field, index)}
                            className="h-9 rounded-xl text-xs"
                          >
                            {day}
                          </Toggle>
                        ))}
                      </div>
                    )}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </section>
        ) : null}

        {modeActual !== SCHEDULE_MODE.OFF ? (
          <section className="rounded-xl border border-border bg-card/85 p-4 shadow-sm dark:shadow-none">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="size-4 text-primary" />
              <FieldTitle className="text-base">
                {modeActual === SCHEDULE_MODE.CONTINUOUS ? 'Continuous output' : 'Dose target'}
              </FieldTitle>
            </div>

            <div
              className={cn('grid gap-4', modeActual === SCHEDULE_MODE.PERIODIC ? 'md:grid-cols-2' : 'md:grid-cols-1')}
            >
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
            </div>
          </section>
        ) : null}

        <Button type="submit" className="w-full" disabled={!isDirty}>
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
