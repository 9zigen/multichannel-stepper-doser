import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, SubmitHandler, Controller } from "react-hook-form"
import { z } from "zod"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner";
import { PumpRunResponse, runPump } from "@/lib/api.ts";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

export interface PumpControlState {
  id: number
  name: string
}
export interface PumpControlProps {
  pumps: PumpControlState[]
}

type FormData = {
  pump_id: number
  direction: boolean
  speed: number
  time: number
};

const FormSchema = z.object({
  pump_id: z.number({required_error: "Please select an pump to control."}).min(0),
  direction: z.boolean(),
  speed: z.number({required_error: "Please select an pump working speed."}).min(0.1),
  time: z.number({required_error: "Please select an pump working time."}).min(1),
})

export default function PumpControl(props: PumpControlProps) {
  const { pumps } = props
  const [ pumpIsRunning, setPumpIsRunning ] = React.useState(false)
  const { control, register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      pump_id: undefined,
      direction: true,
      speed: 1,
      time: 1,
    }
  });
  
  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      const action = {
        id: data.pump_id,
        direction: data.direction,
        speed: data.speed,
        time: data.time,
      }
      const response = await runPump(action) as PumpRunResponse
      if (response.success) {
        toast.success("Pump started.")
        setPumpIsRunning(true)
        setTimeout(() => {
          setPumpIsRunning(false)
          toast.success(`Pump finished in ${data.time} min. Speed: ${data.speed} rpm`)
        }, data.time * 60 * 1000)
      } else {
        toast.error("Pump failed.")
      }
    } catch (e) {
      toast.error("Pump failed.")
      console.error(e)
    }
  };
  
  if (pumps.length === 0) {
    return null;
  }
  
  return (
    <Card className="w-full shadow-none">
      <CardHeader>
        <CardTitle>Pump Control</CardTitle>
        <CardDescription>
          Manual control of pumps. This action cannot be stopped.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-row gap-4">
          <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-row gap-4">
              <div className="w-[50%] mb-2">
                <div className="text-gray-500 pb-1">
                  <label>Pump</label>
                </div>
                <Controller
                  name="pump_id"
                  control={control}
                  render={({ field }) =>
                    <Select
                      onValueChange={(value) => field.onChange(Number(value))}
                      defaultValue={String(field.value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pump" />
                      </SelectTrigger>
                      <SelectContent>
                        {
                          pumps.map((x, index) => {
                            return (
                              <SelectItem key={index} value={String(x.id)}>{x.name}</SelectItem>
                            )
                          })
                        }
                      </SelectContent>
                    </Select>}
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
                  render={({ field }) =>
                    <Select
                      onValueChange={(value) => field.onChange(Boolean(value))}
                      defaultValue={String(field.value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pump" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Counter clock wise</SelectItem>
                        <SelectItem value="true">Clock wise</SelectItem>
                      </SelectContent>
                    </Select>}
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
                  {...register("speed", { valueAsNumber: true })}
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
                  {...register("time", { valueAsNumber: true })}
                />
                {errors.time && <p role="alert">{errors.time?.message}</p>}
              </div>
            </div>
            
            
            <Button
              type="submit"
              className="w-full"
              variant={pumpIsRunning? 'destructive' : 'default'}
              disabled={pumpIsRunning}
            >
              {pumpIsRunning? 'Running...' : 'Run'}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
