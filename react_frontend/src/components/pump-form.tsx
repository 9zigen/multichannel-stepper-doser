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
import { Check, LoaderCircle } from 'lucide-react';

type FormData = {
  id: number;
  state: boolean;
  name: string;
  direction: boolean;
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
    tank_full_vol,
    tank_current_vol,
    tank_concentration_total,
    tank_concentration_active,
    schedule,
    calibration,
  } = pump;
  const updatePump = useAppStore((state: AppStoreState) => state.updatePump);

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
      tank_full_vol: tank_full_vol,
      tank_current_vol: tank_current_vol,
      tank_concentration_total: tank_concentration_total,
      tank_concentration_active: tank_concentration_active,
      schedule: schedule,
      calibration: calibration,
    },
  });

  const [pumpCalibrations, setPumpCalibrations] = useState(calibration);
  const [calibrationChanged, setCalibrationChanged] = useState(false);

  const direction_actual = watch('direction');
  const unsaved = isDirty || calibrationChanged;

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

    if (await updatePump(data, true)) {
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
            <div className="flex flex-row gap-4 mb-4 justify-between items-center h-[38px]">
              <span className="text-base">General</span>
            </div>
            <div className="flex flex-row gap-4 mb-4 justify-between">
              <div className="w-[50%]">
                <div className="text-gray-500 text-sm pb-1">
                  <label>Name</label>
                </div>
                <Input type="text" placeholder="Name" {...register('name')} />
                {errors.name && (
                  <p role="alert" className="text-sm text-red-600">
                    {errors.name?.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-center justify-between pb-2">
                <div className="text-gray-500 text-sm pb-1">
                  <Label htmlFor="pump-direction">{direction_actual ? 'CW' : 'CCW'}</Label>
                </div>
                <Controller
                  name="direction"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="pump-direction"
                      checked={field.value}
                      onCheckedChange={(value) => field.onChange(Boolean(value))}
                    />
                  )}
                />
              </div>

              <div className="flex flex-col items-center justify-between pb-2">
                <div className="text-gray-500 text-sm pb-1">
                  <Label htmlFor="pump-state">Enabled</Label>
                </div>
                <Controller
                  name="state"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="pump-state"
                      checked={field.value}
                      onCheckedChange={(value) => field.onChange(Boolean(value))}
                    />
                  )}
                />
              </div>
            </div>

            <div className="flex flex-row gap-4 mb-6 justify-between">
              <div className="w-[50%]">
                <div className="text-gray-500 text-sm pb-1">
                  <label>Tank full volume</label>
                </div>
                <Input type="number" placeholder="900" {...register('tank_full_vol', { valueAsNumber: true })} />
                {errors.tank_full_vol && (
                  <p role="alert" className="text-sm text-red-600">
                    {errors.tank_full_vol?.message}
                  </p>
                )}
              </div>

              <div className="w-[50%]">
                <div className="text-gray-500 text-sm pb-1">
                  <label>Tank current volume</label>
                </div>
                <Input type="number" placeholder="900" {...register('tank_current_vol', { valueAsNumber: true })} />
                {errors.tank_current_vol && (
                  <p role="alert" className="text-sm text-red-600">
                    {errors.tank_current_vol?.message}
                  </p>
                )}
              </div>
            </div>

            <span className="text-base">Notes</span>
            <div className="flex flex-row gap-4 mb-6 justify-between">
              <div className="w-[50%]">
                <div className="text-gray-500 text-sm pb-1">
                  <label>Solution concentration</label>
                </div>
                <Input
                  type="number"
                  placeholder="20"
                  {...register('tank_concentration_total', { valueAsNumber: true })}
                />
                {errors.tank_concentration_total && (
                  <p role="alert" className="text-sm text-red-600">
                    {errors.tank_concentration_total?.message}
                  </p>
                )}
              </div>

              <div className="w-[50%]">
                <div className="text-gray-500 text-sm pb-1">
                  <label>Element concentration</label>
                </div>
                <Input
                  type="number"
                  placeholder="10"
                  {...register('tank_concentration_active', { valueAsNumber: true })}
                />
                {errors.tank_concentration_active && (
                  <p role="alert" className="text-sm text-red-600">
                    {errors.tank_concentration_active?.message}
                  </p>
                )}
              </div>
            </div>
          </form>

          <div className="flex flex-col xl:w-[50%]">
            <PumpCalibration pump={pump} success={(cal) => addCalibration(cal)} />
            {errors.calibration && (
              <p role="alert" className="text-sm text-red-600">
                {errors.calibration?.message}
              </p>
            )}
            {pumpCalibrations.map((item, index) => (
              <div key={index} className="flex flex-row gap-4 mb-4 bg-gray-100 p-2 rounded-md justify-between">
                <div className="w-auto grid items-center">
                  <span className="text-gray-500 text-sm">Speed</span>
                  <span className="text-sm">{item.speed} RPM</span>
                </div>
                <div className="w-auto grid items-center">
                  <span className="text-gray-500 text-sm">Flow</span>
                  <span className="text-sm">{item.flow} ml/min</span>
                </div>
                <div className="w-[100px] flex items-center">
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full h-full"
                    onClick={() => removeCalibration(index)}
                  >
                    Delete
                  </Button>
                </div>
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
