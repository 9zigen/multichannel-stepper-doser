import React from 'react';
import { Router } from 'lucide-react';
import { Control, Controller, FormState, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { NetworkType } from '@/lib/api.ts';

import { FormData } from './types.ts';

export interface Ipv4Props {
  formState: FormState<FormData>;
  register: UseFormRegister<FormData>;
  control: Control<FormData>;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  networkType: NetworkType;
  isScanning: boolean;
  onScanWifi: () => void;
}

const CommonIPv4Fields = (props: Ipv4Props): React.ReactElement => {
  const { register, formState, control, watch, networkType } = props;
  const { errors } = formState;
  const dhcpSelected = watch('dhcp');
  const isWifi = networkType === NetworkType.WiFi;

  return (
    <>
      {/* DHCP toggle */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-secondary/10 px-3 py-2.5">
        <div className="flex items-center gap-2.5 flex-1">
          <Controller
            name="dhcp"
            control={control}
            render={({ field }) => <Switch id="dhcp-mode" checked={field.value} onCheckedChange={field.onChange} />}
          />
          <div className="flex-1">
            <Label htmlFor="dhcp-mode" className="text-sm font-medium">DHCP</Label>
            <div className="text-xs text-muted-foreground">
              {isWifi ? 'Automatic addressing for station interface.' : 'Automatic addressing for wired interface.'}
            </div>
          </div>
        </div>
        <Router className="size-4 text-muted-foreground" />
      </div>

      {/* Static IP fields */}
      {dhcpSelected ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ip-addr" className="text-xs text-muted-foreground">Static IP</Label>
            <Input id="ip-addr" type="text" placeholder="192.168.1.100" className="h-8 text-sm tabular-nums" {...register('ip_address')} />
            {errors.ip_address && <p className="text-xs text-destructive" role="alert">{errors.ip_address.message}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="netmask" className="text-xs text-muted-foreground">Mask</Label>
            <Input id="netmask" type="text" placeholder="255.255.255.0" className="h-8 text-sm tabular-nums" {...register('mask')} />
            {errors.mask && <p className="text-xs text-destructive" role="alert">{errors.mask.message}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="gw" className="text-xs text-muted-foreground">Gateway</Label>
            <Input id="gw" type="text" placeholder="192.168.1.1" className="h-8 text-sm tabular-nums" {...register('gateway')} />
            {errors.gateway && <p className="text-xs text-destructive" role="alert">{errors.gateway.message}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="dns-addr" className="text-xs text-muted-foreground">DNS</Label>
            <Input id="dns-addr" type="text" placeholder="8.8.8.8" className="h-8 text-sm tabular-nums" {...register('dns')} />
            {errors.dns && <p className="text-xs text-destructive" role="alert">{errors.dns.message}</p>}
          </div>
        </div>
      )}
    </>
  );
};

export default CommonIPv4Fields;
