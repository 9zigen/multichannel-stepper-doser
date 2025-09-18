import React from "react";

import { Controller, SubmitHandler, useForm, ControllerRenderProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label"
import { Toggle } from "@/components/ui/toggle"

import { ScheduleState, PumpCalibrationState, PumpState, SCHEDULE_MODE } from "@/lib/api.ts";
import { AppStoreState, useAppStore } from "@/hooks/use-store.ts";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Check, LoaderCircle } from "lucide-react";

type FormData = {
  id: number
  state: boolean
  name: string
  direction: boolean
  tank_full_vol: number
  tank_current_vol: number
  tank_concentration_total: number
  tank_concentration_active: number
  schedule: ScheduleState
  calibration: PumpCalibrationState[]
};

const FormSchema = z
  .object({
    id: z.number(),
    state: z.boolean(),
    name: z.string(),
    direction: z.boolean(),
    tank_full_vol: z.number(),
    tank_current_vol: z.number(),
    tank_concentration_total: z.number(),
    tank_concentration_active: z.number(),
    calibration: z.array(z.object({speed: z.number(), flow: z.number()})),
    schedule: z.object({
      mode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      work_hours: z.array(z.number()),
      weekdays: z.array(z.number()),
      speed: z.number(),
      time: z.number(),
      volume: z.number(),
    })
  })

export interface ScheduleFormProps {
  pump: PumpState
  success?: () => void
}

const ScheduleForm = ({pump, success}: ScheduleFormProps): React.ReactElement => {
  const { id, state, name, direction, tank_full_vol, tank_current_vol, tank_concentration_total, tank_concentration_active, schedule, calibration } = pump;
  const updatePumps = useAppStore((state: AppStoreState) => state.updatePumps);
  
  const { control, register, handleSubmit, formState, watch, reset } = useForm<FormData>({
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
      calibration: calibration
    }
  });
  
  const modeActual = watch("schedule.mode");
  const hours = Array.from(Array(24).keys());
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  
  const toggleHour = async (field: ControllerRenderProps<FormData, "schedule.work_hours">, hour: number) => {
    let value: any[]
    if (!field.value.includes(hour)) {
      value = [...field.value, hour]
    } else {
      value = field.value.filter((item: number) => item !== hour)
    }
    field.onChange(value)
  }
  
  const toggleDay = async (field: ControllerRenderProps<FormData, "schedule.weekdays">, day: string) => {
    let value: any[]
    const id = days.indexOf(day);
    if (!field.value.includes(id)) {
      value = [...field.value, id]
    } else {
      value = field.value.filter((item: number) => item !== id)
    }
    field.onChange(value)
  }
  
  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (await updatePumps(data, true)) {
      reset(data);
      toast.success("Pumps settings saved.")
      if (success) {
        success();
      }
    } else {
      toast.error("Pumps settings not saved.")
    }
  };
  
  return (
    <React.Fragment>
      <div className="flex flex-col xl:flex-row xl:gap-6">
        <form id="pump-form" className="flex flex-col w-full" onSubmit={handleSubmit(onSubmit, (errors) => console.log(errors))}>
          <div className="flex flex-row gap-4 mb-4 justify-between items-center h-[38px]">
            <Label className="text-base">Schedule settings</Label>
          </div>
          <div className="flex flex-row items-center justify-between gap-4 mb-6">
            <div className="text-gray-500 text-sm pb-1">
              <Label>Mode</Label>
            </div>
            <Controller
              name="schedule.mode"
              control={control}
              render={({ field }) =>
                <Select
                  onValueChange={(value) => field.onChange(Number(value))}
                  defaultValue={String(field.value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="1">Periodic</SelectItem>
                    <SelectItem value="2">Continuous</SelectItem>
                  </SelectContent>
                </Select>}
            />
          </div>
          
          {/* Periodic: hours */}
          {
            modeActual === SCHEDULE_MODE.PERIODIC? (
              <React.Fragment>
                <div className="text-gray-500 text-sm pb-1">
                  <Label>Hours</Label>
                </div>
                <div className="flex flex-row flex-wrap items-center justify-between gap-1 mb-6">
                  <Controller
                    name="schedule.work_hours"
                    control={control}
                    render={({ field }) =>
                      <>
                        {
                          hours.map((item, index) => (
                            <Toggle
                              key={index}
                              pressed={field.value.includes(item)}
                              onClick={() => toggleHour(field, item)}
                              className="w-10">{item}</Toggle>
                          ))
                        }
                      </>
                    } />
                </div>
              </React.Fragment>) : null
          }
          
          {/* Periodic: weekdays */}
          {
            modeActual === SCHEDULE_MODE.PERIODIC? (
              <React.Fragment>
                <div className="text-gray-500 text-sm pb-1">
                  <Label>Weekdays</Label>
                </div>
                <div className="flex flex-row flex-wrap items-center justify-between gap-1 mb-6">
                  <Controller
                    name="schedule.weekdays"
                    control={control}
                    render={({ field }) =>
                      <>
                        {
                          days.map((item, index) => (
                            <Toggle
                              key={index}
                              pressed={field.value.includes(index)}
                              onClick={() => toggleDay(field, item)}
                              className="w-10">{item}</Toggle>
                          ))
                        }
                      </>
                    } />
                </div>
              </React.Fragment>) : null
          }
          
          {
            modeActual !== SCHEDULE_MODE.OFF? (
              <div className="flex flex-row gap-4 mb-4 justify-between">
                <div className={modeActual === SCHEDULE_MODE.PERIODIC? 'w-[50%]' : 'w-full'}>
                  <div className="text-gray-500 text-sm pb-1">
                    <Label>Speed [rpm]</Label>
                  </div>
                  <Input
                    type="number"
                    placeholder="RPM"
                    min="0.1"
                    step="0.1"
                    {...register("schedule.speed", { valueAsNumber: true })}
                  />
                  {formState.errors.schedule?.speed && <p role="alert" className="text-sm text-red-600">{formState.errors.schedule?.speed?.message}</p>}
                </div>
                
                {
                  modeActual === SCHEDULE_MODE.PERIODIC? (
                    <React.Fragment>
                      <div className="w-[50%]">
                        <div className="text-gray-500 text-sm pb-1">
                          <Label>Volume [ml]</Label>
                        </div>
                        <Input
                          type="number"
                          placeholder="ml/day"
                          min="0.1"
                          step="0.1"
                          {...register("schedule.volume", { valueAsNumber: true })}
                        />
                        {formState.errors.schedule?.volume && <p role="alert" className="text-sm text-red-600">{formState.errors.schedule?.volume?.message}</p>}
                      </div>
                    </React.Fragment>) : null
                }
              </div>) : null
          }
          <Button
            size="icon"
            type="submit"
            className="w-full"
            disabled={!formState.isDirty}
            variant="secondary">
            {
              formState.isSubmitting?
                <><LoaderCircle size={20} className="animate-spin"/> Saving</> : <><Check size={20}/> Apply</>
            }
          </Button>
        </form>
      </div>
    </React.Fragment>
  );
};

export default ScheduleForm;
