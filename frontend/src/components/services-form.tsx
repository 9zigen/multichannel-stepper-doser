import React from 'react';
import { Controller, SubmitHandler, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock3, Globe, RadioTower, RefreshCcw } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ServiceState } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';

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
  hostname: z
    .string()
    .min(3, 'Hostname must be at least 3 characters.')
    .max(20, 'Hostname must be 20 characters or fewer.'),
  ntp_server: z.string().max(64, 'NTP server must be 64 characters or fewer.'),
  utc_offset: z.number(),
  ntp_dst: z.boolean(),
  mqtt_ip_address: z.string().max(64, 'Broker host must be 64 characters or fewer.'),
  mqtt_port: z
    .string()
    .refine(
      (value) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535),
      'Port must be between 1 and 65535.'
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

type SectionProps = {
  title: string;
  description: string;
  icon: React.ComponentType<React.ComponentProps<'svg'>>;
  children: React.ReactNode;
};

const SettingsSection = ({ title, description, icon: Icon, children }: SectionProps) => {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <FieldTitle className="text-base">
          <Icon data-icon="inline-start" />
          {title}
        </FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </div>
      <Separator className="my-4" />
      {children}
    </section>
  );
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
      utc_offset: services.utc_offset,
      ntp_dst: services.ntp_dst,
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
    <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
      <FieldGroup className="gap-5">
        <SettingsSection
          title="Device Identity"
          description="Settings that help other devices discover and identify this doser on the local network."
          icon={Globe}
        >
          <Field>
            <FieldLabel htmlFor="hostname">Hostname</FieldLabel>
            <FieldContent>
              <Input
                id="hostname"
                type="text"
                placeholder="reef-doser"
                {...register('hostname')}
                aria-invalid={!!errors.hostname}
              />
              <FieldDescription>Used for network discovery, dashboards, and local troubleshooting.</FieldDescription>
              <FieldError errors={[errors.hostname]} />
            </FieldContent>
          </Field>
        </SettingsSection>

        <SettingsSection
          title="Time Sync"
          description="Keep schedules and logs accurate by syncing the device clock from an NTP source."
          icon={Clock3}
        >
          <Field orientation="horizontal" className="items-start justify-between rounded-xl border bg-muted/20 p-4">
            <FieldContent className="gap-1">
              <FieldLabel htmlFor="enable-ntp">Enable NTP</FieldLabel>
              <FieldDescription>Recommended for scheduled dosing and consistent timestamps.</FieldDescription>
            </FieldContent>
            <Controller
              name="enable_ntp"
              control={control}
              render={({ field }) => <Switch id="enable-ntp" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </Field>

          <div className={cn('grid gap-4 md:grid-cols-2', !enableNtp && 'opacity-60')}>
            <Field data-disabled={!enableNtp}>
              <FieldLabel htmlFor="ntp_server">NTP server</FieldLabel>
              <FieldContent>
                <Input
                  id="ntp_server"
                  type="text"
                  placeholder="pool.ntp.org"
                  {...register('ntp_server')}
                  disabled={!enableNtp}
                  aria-invalid={!!errors.ntp_server}
                />
                <FieldDescription>Use a public pool or your local gateway if it provides time sync.</FieldDescription>
                <FieldError errors={[errors.ntp_server]} />
              </FieldContent>
            </Field>

            <Field data-disabled={!enableNtp}>
              <FieldLabel htmlFor="utc_offset">UTC offset</FieldLabel>
              <FieldContent>
                <Input
                  id="utc_offset"
                  type="number"
                  step={1}
                  placeholder="1"
                  {...register('utc_offset', { valueAsNumber: true })}
                  disabled={!enableNtp}
                  aria-invalid={!!errors.utc_offset}
                />
                <FieldDescription>Hours offset from UTC for the device timezone.</FieldDescription>
                <FieldError errors={[errors.utc_offset]} />
              </FieldContent>
            </Field>
          </div>

          <Field orientation="horizontal" className="items-start justify-between rounded-xl border bg-muted/20 p-4">
            <FieldContent className="gap-1">
              <FieldLabel htmlFor="dst-mode">Daylight saving time</FieldLabel>
              <FieldDescription>
                Apply DST automatically when your dosing schedule should follow local clock time.
              </FieldDescription>
            </FieldContent>
            <Controller
              name="ntp_dst"
              control={control}
              render={({ field }) => (
                <Switch id="dst-mode" checked={field.value} onCheckedChange={field.onChange} disabled={!enableNtp} />
              )}
            />
          </Field>
        </SettingsSection>

        <SettingsSection
          title="MQTT Telemetry"
          description="Publish device state into your local automation stack, broker, or observability pipeline."
          icon={RadioTower}
        >
          <Field orientation="horizontal" className="items-start justify-between rounded-xl border bg-muted/20 p-4">
            <FieldContent className="gap-1">
              <FieldLabel htmlFor="enable-mqtt">Enable MQTT</FieldLabel>
              <FieldDescription>
                Turn this on when the doser should report to Home Assistant, Node-RED, or another broker.
              </FieldDescription>
            </FieldContent>
            <Controller
              name="enable_mqtt"
              control={control}
              render={({ field }) => <Switch id="enable-mqtt" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </Field>

          <div className={cn('grid gap-4 md:grid-cols-[minmax(0,1fr)_120px_120px]', !enableMqtt && 'opacity-60')}>
            <Field data-disabled={!enableMqtt}>
              <FieldLabel htmlFor="mqtt_ip_address">Broker host</FieldLabel>
              <FieldContent>
                <Input
                  id="mqtt_ip_address"
                  type="text"
                  placeholder="mqtt.local or 192.168.1.10"
                  {...register('mqtt_ip_address')}
                  disabled={!enableMqtt}
                  aria-invalid={!!errors.mqtt_ip_address}
                />
                <FieldDescription>Accepts a LAN IP or a resolvable local hostname.</FieldDescription>
                <FieldError errors={[errors.mqtt_ip_address]} />
              </FieldContent>
            </Field>

            <Field data-disabled={!enableMqtt}>
              <FieldLabel htmlFor="mqtt_port">Port</FieldLabel>
              <FieldContent>
                <Input
                  id="mqtt_port"
                  type="text"
                  placeholder="1883"
                  {...register('mqtt_port')}
                  disabled={!enableMqtt}
                  aria-invalid={!!errors.mqtt_port}
                />
                <FieldError errors={[errors.mqtt_port]} />
              </FieldContent>
            </Field>

            <Field data-disabled={!enableMqtt}>
              <FieldLabel htmlFor="mqtt_qos">QoS</FieldLabel>
              <FieldContent>
                <Input
                  id="mqtt_qos"
                  type="number"
                  min={0}
                  max={2}
                  step={1}
                  placeholder="0"
                  {...register('mqtt_qos', { valueAsNumber: true })}
                  disabled={!enableMqtt}
                  aria-invalid={!!errors.mqtt_qos}
                />
                <FieldError errors={[errors.mqtt_qos]} />
              </FieldContent>
            </Field>
          </div>

          <div className={cn('grid gap-4 md:grid-cols-2', !enableMqtt && 'opacity-60')}>
            <Field data-disabled={!enableMqtt}>
              <FieldLabel htmlFor="mqtt_user">User</FieldLabel>
              <FieldContent>
                <Input
                  id="mqtt_user"
                  type="text"
                  placeholder="optional"
                  {...register('mqtt_user')}
                  disabled={!enableMqtt}
                  aria-invalid={!!errors.mqtt_user}
                />
                <FieldError errors={[errors.mqtt_user]} />
              </FieldContent>
            </Field>

            <Field data-disabled={!enableMqtt}>
              <FieldLabel htmlFor="mqtt_password">Password</FieldLabel>
              <FieldContent>
                <Input
                  id="mqtt_password"
                  type="password"
                  placeholder="optional"
                  {...register('mqtt_password')}
                  disabled={!enableMqtt}
                  aria-invalid={!!errors.mqtt_password}
                />
                <FieldError errors={[errors.mqtt_password]} />
              </FieldContent>
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Firmware Delivery"
          description="Point the device to a firmware source on your LAN so OTA updates are predictable and recoverable."
          icon={RefreshCcw}
        >
          <Field>
            <FieldLabel htmlFor="ota_url">OTA URL</FieldLabel>
            <FieldContent>
              <Input
                id="ota_url"
                type="text"
                placeholder="http://192.168.1.10/device.ota.bin"
                {...register('ota_url')}
                aria-invalid={!!errors.ota_url}
              />
              <FieldDescription>
                Prefer a stable local URL so field updates do not depend on internet access.
              </FieldDescription>
              <FieldError errors={[errors.ota_url]} />
            </FieldContent>
          </Field>
        </SettingsSection>

        <div className="flex justify-end">
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save services'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
};

export default ServicesForm;
