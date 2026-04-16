import React from 'react';
import { LockKeyhole, ScanSearch, Signal, WifiHigh } from 'lucide-react';
import { Control, Controller, FormState, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch.tsx';
import { NetworkType, WifiScanNetwork } from '@/lib/api.ts';

import { FormData } from './types.ts';
import CommonIpv4Fields from "@/components/network-form/common-ipv4-fields.tsx";

export interface Ipv4Props {
  formState: FormState<FormData>;
  register: UseFormRegister<FormData>;
  control: Control<FormData>;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  networkType: NetworkType;
  wifiNetworks: WifiScanNetwork[];
  isScanning: boolean;
  onScanWifi: () => void;
}

const getSignalBadgeVariant = (rssi: number): 'default' | 'secondary' | 'outline' => {
  if (rssi >= -55) return 'default';
  if (rssi >= -72) return 'secondary';
  return 'outline';
};

const WifiIpv4Fields = (props: Ipv4Props): React.ReactElement => {
  const { register, formState, control, watch, setValue, networkType, wifiNetworks, isScanning, onScanWifi } = props;
  const { errors } = formState;
  const keepApActive = watch('keep_ap_active');
  const isWifi = networkType === NetworkType.WiFi;

  return (
    <div className="flex flex-col gap-3">
      {isWifi ? (
        <>
          {/* WiFi scan */}
          <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Nearby Wi-Fi</span>
              <Button type="button" variant="outline" size="sm" onClick={onScanWifi} disabled={isScanning}>
                <ScanSearch className="size-3.5" data-icon="inline-start" />
                {isScanning ? 'Scanning...' : 'Rescan'}
              </Button>
            </div>
            <ScrollArea className="max-h-50 rounded-md border border-border/30 bg-background/50">
              <div className="flex flex-col gap-1 p-1.5 max-h-48">
                {wifiNetworks.length ? (
                  wifiNetworks.map((network, index) => (
                    <button
                      key={`${network.ssid}-${network.channel}`}
                      type="button"
                      className="animate-fade-in-up flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors hover:bg-primary/5"
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => setValue('ssid', network.ssid, { shouldDirty: true, shouldValidate: true })}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <WifiHigh className="size-3.5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{network.ssid}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Ch {network.channel}</span>
                            {network.secure && <LockKeyhole className="size-3" />}
                          </div>
                        </div>
                      </div>
                      <Badge variant={getSignalBadgeVariant(network.rssi)} className="text-xs tabular-nums">
                        <Signal className="mr-1 size-3" />
                        {network.rssi}
                      </Badge>
                    </button>
                  ))
                ) : (
                  <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                    No access points found. Try rescan or enter SSID manually.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* SSID + Password */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="wifi-ssid" className="text-xs text-muted-foreground">SSID</Label>
              <Input id="wifi-ssid" type="text" placeholder="Wi-Fi network name" className="h-8 text-sm" {...register('ssid')} />
              {errors.ssid && <p className="text-xs text-destructive" role="alert">{errors.ssid.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="wifi-password" className="text-xs text-muted-foreground">Password</Label>
              <Input id="wifi-password" type="password" placeholder="Wi-Fi password" className="h-8 text-sm" {...register('password')} />
              {errors.password && <p className="text-xs text-destructive" role="alert">{errors.password.message}</p>}
            </div>
          </div>

          {/* AP+STA toggle */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-secondary/10 px-3 py-2.5">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="keep-ap-active" className="text-sm font-medium">AP + Station mode</Label>
                <Badge variant={keepApActive ? 'default' : 'outline'} className="text-xs">
                  {keepApActive ? 'AP+STA' : 'STA only'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">Keep access point active alongside router connection.</div>
            </div>
            <Controller
              name="keep_ap_active"
              control={control}
              render={({ field }) => (
                <Switch id="keep-ap-active" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </>
      ) : null}

      <CommonIpv4Fields {...props}></CommonIpv4Fields>
    </div>
  );
};

export default WifiIpv4Fields;
