import React from 'react';

import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Input } from '@/components/ui/input.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { ServiceState } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { toast } from 'sonner';

type FormData = {
  hostname: string;
  ntp_server: string;
  utc_offset: number;
  ntp_dst: boolean;
  mqtt_ip_address: string;
  mqtt_port: string;
  mqtt_user: string;
  mqtt_password: string;
  mqtt_qos: number;
  enable_ntp: boolean;
  enable_mqtt: boolean;
  ota_url: string;
};

const FormSchema = z.object({
  hostname: z.string().min(3).max(20),
  ntp_server: z.string().min(3).max(20).or(z.literal('')),
  utc_offset: z.number(),
  ntp_dst: z.boolean(),
  mqtt_ip_address: z.ipv4().or(z.literal('')),
  mqtt_port: z.string().or(z.literal('')),
  mqtt_user: z.string().or(z.literal('')),
  mqtt_password: z.string().or(z.literal('')),
  mqtt_qos: z.number(),
  enable_ntp: z.boolean(),
  enable_mqtt: z.boolean(),
  ota_url: z.string().or(z.literal('')),
});

export interface ServicesPageProps {
  services: ServiceState;
  success?: () => void;
}

const ServicesForm = ({ services, success }: ServicesPageProps): React.ReactElement => {
  const {
    hostname,
    ntp_server,
    utc_offset,
    ntp_dst,
    mqtt_ip_address,
    mqtt_port,
    mqtt_user,
    mqtt_password,
    mqtt_qos,
    enable_ntp,
    enable_mqtt,
    ota_url,
  } = services;

  const updateServices = useAppStore((state: AppStoreState) => state.updateServices);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      hostname: hostname,
      ntp_server: ntp_server,
      utc_offset: utc_offset,
      ntp_dst: ntp_dst,
      mqtt_ip_address: mqtt_ip_address,
      mqtt_port: mqtt_port,
      mqtt_user: mqtt_user,
      mqtt_password: mqtt_password,
      mqtt_qos: mqtt_qos,
      enable_ntp: enable_ntp,
      enable_mqtt: enable_mqtt,
      ota_url: ota_url,
    },
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (await updateServices(data)) {
      toast.success('Services settings saved.');
      if (success) {
        success();
      }
    } else {
      toast.error('Services settings not saved.');
    }
  };

  return (
    <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-row gap-4 mb-4">
        <div className="w-full">
          <div className="text-gray-500 pb-1">
            <label>Hostname</label>
          </div>
          <Input type="text" placeholder="Host name" {...register('hostname')} />
          {errors.hostname && (
            <p role="alert" className="text-red-800">
              {errors.hostname?.message}
            </p>
          )}
        </div>
      </div>

      {/* NTP */}
      <div className="text-gray-500 flex flex-row gap-4 pb-1">
        <Controller
          name="enable_ntp"
          control={control}
          render={({ field }) => <Switch id="enable-ntp" checked={field.value} onCheckedChange={field.onChange} />}
        />
        <span className="text-base">NTP Service</span>
      </div>
      <div className="flex flex-row gap-4 mb-4">
        <div className="w-[30%]">
          <div className="text-gray-500 pb-1">
            <label className="text-sm">Server</label>
          </div>
          <Input type="string" placeholder="NTP Server" {...register('ntp_server')} />
          {errors.ntp_server && (
            <p role="alert" className="text-red-800">
              {errors.ntp_server?.message}
            </p>
          )}
        </div>

        <div className="w-[30%]">
          <div className="text-gray-500 pb-1">
            <label className="text-sm">UTC offset</label>
          </div>
          <Input type="number" step={1} placeholder="UTC offset" {...register('utc_offset', { valueAsNumber: true })} />
          {errors.utc_offset && (
            <p role="alert" className="text-red-800">
              {errors.utc_offset?.message}
            </p>
          )}
        </div>

        <div className="w-[30%] flex flex-col gap-2 items-center">
          <div className="text-gray-500">
            <Label className="text-sm" htmlFor="dst-mode">
              Daylight save
            </Label>
          </div>
          <Controller
            name="ntp_dst"
            control={control}
            render={({ field }) => <Switch id="dst-mode" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </div>
      </div>

      {/* MQTT */}
      <div className="text-gray-500 flex flex-row gap-4 pb-1">
        <Controller
          name="enable_mqtt"
          control={control}
          render={({ field }) => <Switch id="enable-mqtt" checked={field.value} onCheckedChange={field.onChange} />}
        />
        <span className="text-base">MQTT Service</span>
      </div>
      <div className="flex flex-row gap-4 mb-4">
        <div className="w-auto">
          <div className="text-gray-500 pb-1">
            <label className="text-sm">IP Address</label>
          </div>
          <Input type="string" placeholder="10.0.0.10" {...register('mqtt_ip_address')} />
          {errors.mqtt_ip_address && (
            <p role="alert" className="text-red-800">
              {errors.mqtt_ip_address?.message}
            </p>
          )}
        </div>
        <div className="w-[100px]">
          <div className="text-gray-500 pb-1">
            <label className="text-sm">Server port</label>
          </div>
          <Input type="string" placeholder="1883" {...register('mqtt_port')} />
          {errors.mqtt_port && (
            <p role="alert" className="text-red-800">
              {errors.mqtt_port?.message}
            </p>
          )}
        </div>
        <div className="w-[60px]">
          <div className="text-gray-500 pb-1">
            <label className="text-sm">QOS</label>
          </div>
          <Input type="number" placeholder="0" {...register('mqtt_qos', { valueAsNumber: true })} />
          {errors.mqtt_qos && (
            <p role="alert" className="text-red-800">
              {errors.mqtt_qos?.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-row gap-4 mb-4">
        <div className="w-[50%]">
          <div className="text-gray-500 pb-1">
            <label className="text-sm">User</label>
          </div>
          <Input type="string" placeholder="username" {...register('mqtt_user')} />
          {errors.mqtt_user && (
            <p role="alert" className="text-red-800">
              {errors.mqtt_user?.message}
            </p>
          )}
        </div>
        <div className="w-[50%]">
          <div className="text-gray-500 pb-1">
            <label className="text-sm">Password</label>
          </div>
          <Input type="string" placeholder="password" {...register('mqtt_password')} />
          {errors.mqtt_password && (
            <p role="alert" className="text-red-800">
              {errors.mqtt_password?.message}
            </p>
          )}
        </div>
      </div>

      <div className="text-gray-500 pb-1">
        <span className="text-base">Firmware Update</span>
      </div>
      <div className="w-full">
        <div className="text-gray-500 pb-1">
          <label className="text-sm">OTA URL</label>
        </div>
        <Input type="string" placeholder="http://10.0.0.10/ota" {...register('ota_url')} />
        {errors.ota_url && (
          <p role="alert" className="text-red-800">
            {errors.ota_url?.message}
          </p>
        )}
      </div>

      <div className="flex flex-row mt-8">
        <Button type="submit" className="w-full">
          Save
        </Button>
      </div>
    </form>
  );
};

export default ServicesForm;
