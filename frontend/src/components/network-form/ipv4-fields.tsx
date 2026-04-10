import React from 'react';
import { LockKeyhole, Router, ScanSearch, Signal, Wifi, WifiHigh } from 'lucide-react';
import { Control, Controller, FormState, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch.tsx';
import { NetworkType, WifiScanNetwork } from '@/lib/api.ts';

import { FormData } from './types.ts';

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
  if (rssi >= -55) {
    return 'default';
  }

  if (rssi >= -72) {
    return 'secondary';
  }

  return 'outline';
};

const IPv4Fields = (props: Ipv4Props): React.ReactElement => {
  const { register, formState, control, watch, setValue, networkType, wifiNetworks, isScanning, onScanWifi } = props;
  const { errors } = formState;
  const dhcpSelected = watch('dhcp');
  const keepApActive = watch('keep_ap_active');
  const isWifi = networkType === NetworkType.WiFi;

  return (
    <React.Fragment>
      {isWifi ? (
        <Card className="mb-6 overflow-hidden border-border bg-card/70 shadow-none">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Nearby Wi-Fi</CardTitle>
                <CardDescription>
                  Scan is enabled by default for faster setup. Manual SSID entry remains available below.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={onScanWifi} disabled={isScanning}>
                <ScanSearch data-icon="inline-start" />
                {isScanning ? 'Scanning...' : 'Rescan'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ScrollArea className="max-h-64 rounded-xl border bg-muted/20">
              <div className="grid gap-2 p-3">
                {wifiNetworks.length ? (
                  wifiNetworks.map((network) => (
                    <button
                      key={`${network.ssid}-${network.channel}`}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => setValue('ssid', network.ssid, { shouldDirty: true, shouldValidate: true })}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                          <WifiHigh className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{network.ssid}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>Channel {network.channel}</span>
                            <span>{network.secure ? 'Secured' : 'Open'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {network.secure ? <LockKeyhole className="size-4 text-muted-foreground" /> : null}
                        <Badge variant={getSignalBadgeVariant(network.rssi)}>
                          <Signal className="mr-1 size-3" />
                          {network.rssi} dBm
                        </Badge>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed bg-card px-4 py-6 text-sm text-muted-foreground">
                    No access points found yet. Try another scan or enter the SSID manually.
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-card to-card p-4">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Wifi className="size-4 text-primary" />
                Onboarding access point
              </div>
              <div className="mb-3 text-sm text-muted-foreground">
                Keep the device access point active while joining your router. This improves first-time provisioning and
                gives you a fallback path if the station link is unstable.
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-3">
                <div>
                  <div className="text-sm font-medium">Simultaneous AP + Station mode</div>
                  <div className="text-xs text-muted-foreground">
                    Recommended during setup. You can disable it later if you want station-only operation.
                  </div>
                </div>
                <Controller
                  name="keep_ap_active"
                  control={control}
                  render={({ field }) => (
                    <Switch id="keep-ap-active" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={keepApActive ? 'default' : 'outline'}>{keepApActive ? 'AP+STA' : 'STA only'}</Badge>
                <span>Default for smoother commissioning and local recovery access.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isWifi ? (
        <div className="mb-6 grid gap-4 rounded-xl border bg-card p-4">
          <div>
            <div className="pb-1">
              <label>SSID</label>
            </div>
            <Input type="text" placeholder="Wi-Fi SSID" {...register('ssid')} />
            {errors.ssid && <p role="alert">{errors.ssid?.message}</p>}
          </div>

          <div>
            <div className="pb-1">
              <label>Password</label>
            </div>
            <Input type="password" placeholder="Wi-Fi password" {...register('password')} />
            {errors.password && <p role="alert">{errors.password?.message}</p>}
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <Controller
          name="dhcp"
          control={control}
          render={({ field }) => <Switch id="dhcp-mode" checked={field.value} onCheckedChange={field.onChange} />}
        />
        <div className="flex-1">
          <Label htmlFor="dhcp-mode">{isWifi ? 'DHCP for station interface' : 'DHCP'}</Label>
          <div className="text-xs text-muted-foreground">
            {isWifi
              ? 'Use automatic addressing for the router connection unless you need a fixed local IP.'
              : 'Use automatic addressing unless the device needs a static wired address.'}
          </div>
        </div>
        <Router className="size-4 text-muted-foreground" />
      </div>

      {dhcpSelected ? null : (
        <React.Fragment>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="pb-1">
                <label>Static IP Address</label>
              </div>
              <Input type="text" placeholder="IP Address" {...register('ip_address')} />
              {errors.ip_address && <p role="alert">{errors.ip_address?.message}</p>}
            </div>

            <div>
              <div className="pb-1">
                <label>Mask</label>
              </div>
              <Input type="text" placeholder="Netmask" {...register('mask')} />
              {errors.mask && <p role="alert">{errors.mask?.message}</p>}
            </div>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="pb-1">
                <label>Gateway</label>
              </div>
              <Input type="text" placeholder="Gateway" {...register('gateway')} />
              {errors.gateway && <p role="alert">{errors.gateway?.message}</p>}
            </div>

            <div>
              <div className="pb-1">
                <label>DNS</label>
              </div>
              <Input type="text" placeholder="DNS server" {...register('dns')} />
              {errors.dns && <p role="alert">{errors.dns?.message}</p>}
            </div>
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
};

export default IPv4Fields;
