import React from 'react';
import { Controller, SubmitHandler, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock3, Globe, RadioTower, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ServiceState } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { TIME_ZONE_OPTIONS } from '@/lib/timezones.ts';

type FormData = {
  hostname: string;
  ntp_server: string;
  time_zone: string;
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
  hostname: z
    .string()
    .min(3, 'Hostname must be at least 3 characters.')
    .max(20, 'Hostname must be 20 characters or fewer.'),
  ntp_server: z.string().max(64, 'NTP server must be 64 characters or fewer.'),
  time_zone: z.string().min(1, 'Select a time zone.'),
  mqtt_ip_address: z.string().max(64, 'Broker host must be 64 characters or fewer.'),
  mqtt_port: z
    .string()
    .refine(
      (value) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535),
      'Port must be between 1 and 65535.',
    ),
  mqtt_user: z.string().max(64, 'User must be 64 characters or fewer.'),
  mqtt_password: z.string().max(64, 'Password must be 64 characters or fewer.'),
  mqtt_qos: z.number().min(0, 'QoS must be 0, 1, or 2.').max(2, 'QoS must be 0, 1, or 2.'),
  enable_ntp: z.boolean(),
  enable_mqtt: z.boolean(),
  ota_url: z.string().max(256, 'OTA URL must be 256 characters or fewer.'),
});

type ServicesPageProps = {
  services: ServiceState;
  success?: () => void;
};

const ServicesForm = ({ services, success }: ServicesPageProps): React.ReactElement => {
  const updateServices = useAppStore((state: AppStoreState) => state.updateServices);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      hostname: services.hostname,
      ntp_server: services.ntp_server,
      time_zone: services.time_zone || 'UTC',
      mqtt_ip_address: services.mqtt_ip_address,
      mqtt_port: services.mqtt_port,
      mqtt_user: services.mqtt_user,
      mqtt_password: services.mqtt_password,
      mqtt_qos: services.mqtt_qos,
      enable_ntp: services.enable_ntp,
      enable_mqtt: services.enable_mqtt,
      ota_url: services.ota_url,
    },
  });

  const enableNtp = useWatch({ control, name: 'enable_ntp' });
  const enableMqtt = useWatch({ control, name: 'enable_mqtt' });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (await updateServices(data)) {
      toast.success('Services settings saved.');
      success?.();
      return;
    }
    toast.error('Services settings not saved.');
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      {/* Device Identity */}
      <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Globe className="size-3" />
          Identity
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hostname" className="text-xs text-muted-foreground">Hostname</Label>
          <Input
            id="hostname"
            type="text"
            placeholder="reef-doser"
            className="h-8 text-sm"
            {...register('hostname')}
            aria-invalid={!!errors.hostname}
          />
          {errors.hostname && <p className="text-xs text-destructive">{errors.hostname.message}</p>}
        </div>
      </div>

      {/* Time Sync */}
      <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Clock3 className="size-3" />
            Time Sync
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="enable-ntp" className="text-xs text-muted-foreground">NTP</Label>
            <Controller
              name="enable_ntp"
              control={control}
              render={({ field }) => <Switch id="enable-ntp" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
        </div>
        <div className={cn('grid gap-3 sm:grid-cols-2', !enableNtp && 'opacity-40 pointer-events-none')}>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ntp_server" className="text-xs text-muted-foreground">NTP Server</Label>
            <Input
              id="ntp_server"
              type="text"
              placeholder="pool.ntp.org"
              className="h-8 text-sm"
              {...register('ntp_server')}
              disabled={!enableNtp}
            />
            {errors.ntp_server && <p className="text-xs text-destructive">{errors.ntp_server.message}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="time_zone" className="text-xs text-muted-foreground">Time Zone</Label>
            <Controller
              name="time_zone"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!enableNtp}>
                  <SelectTrigger id="time_zone" className="h-8 text-sm">
                    <SelectValue placeholder="Select time zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_ZONE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.time_zone && <p className="text-xs text-destructive">{errors.time_zone.message}</p>}
          </div>
        </div>
      </div>

      {/* MQTT */}
      <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <RadioTower className="size-3" />
            MQTT Telemetry
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="enable-mqtt" className="text-xs text-muted-foreground">MQTT</Label>
            <Controller
              name="enable_mqtt"
              control={control}
              render={({ field }) => <Switch id="enable-mqtt" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
        </div>
        <div className={cn('flex flex-col gap-3', !enableMqtt && 'opacity-40 pointer-events-none')}>
          <div className="grid gap-3 sm:grid-cols-[1fr_100px_80px]">
            <div className="flex flex-col gap-1">
              <Label htmlFor="mqtt_ip_address" className="text-xs text-muted-foreground">Broker Host</Label>
              <Input
                id="mqtt_ip_address"
                type="text"
                placeholder="192.168.1.10"
                className="h-8 text-sm"
                {...register('mqtt_ip_address')}
                disabled={!enableMqtt}
              />
              {errors.mqtt_ip_address && <p className="text-xs text-destructive">{errors.mqtt_ip_address.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mqtt_port" className="text-xs text-muted-foreground">Port</Label>
              <Input
                id="mqtt_port"
                type="text"
                placeholder="1883"
                className="h-8 text-sm tabular-nums"
                {...register('mqtt_port')}
                disabled={!enableMqtt}
              />
              {errors.mqtt_port && <p className="text-xs text-destructive">{errors.mqtt_port.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mqtt_qos" className="text-xs text-muted-foreground">QoS</Label>
              <Input
                id="mqtt_qos"
                type="number"
                min={0}
                max={2}
                step={1}
                placeholder="0"
                className="h-8 text-sm tabular-nums"
                {...register('mqtt_qos', { valueAsNumber: true })}
                disabled={!enableMqtt}
              />
              {errors.mqtt_qos && <p className="text-xs text-destructive">{errors.mqtt_qos.message}</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="mqtt_user" className="text-xs text-muted-foreground">User</Label>
              <Input
                id="mqtt_user"
                type="text"
                placeholder="optional"
                className="h-8 text-sm"
                {...register('mqtt_user')}
                disabled={!enableMqtt}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mqtt_password" className="text-xs text-muted-foreground">Password</Label>
              <Input
                id="mqtt_password"
                type="password"
                placeholder="optional"
                className="h-8 text-sm"
                {...register('mqtt_password')}
                disabled={!enableMqtt}
              />
            </div>
          </div>
        </div>
      </div>

      {/* OTA */}
      <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <RefreshCcw className="size-3" />
          Firmware Delivery
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ota_url" className="text-xs text-muted-foreground">OTA URL</Label>
          <Input
            id="ota_url"
            type="text"
            placeholder="http://192.168.1.10/device.ota.bin"
            className="h-8 text-sm"
            {...register('ota_url')}
            aria-invalid={!!errors.ota_url}
          />
          {errors.ota_url && <p className="text-xs text-destructive">{errors.ota_url.message}</p>}
        </div>
      </div>

      {/* Save */}
      <div className="border-t border-border/40 pt-3">
        <Button type="submit" size="sm" className="w-full sm:w-auto" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save services'}
        </Button>
      </div>
    </form>
  );
};

export default ServicesForm;
