import React, { useMemo, useState } from 'react';
import { Activity, Cpu, RefreshCcw, Router, ShieldAlert, TimerReset, Wifi } from 'lucide-react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import PumpControl from '@/components/home/pump-control.tsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const formatPackets = (value: number) => new Intl.NumberFormat('en-US').format(value);

const formatHours = (value: number) => `${value.toFixed(1)} h`;

const Home: React.FC = (): React.ReactElement => {
  const deviceStatus = useAppStore((state: AppStoreState) => state.status);
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);
  const updatePump = useAppStore((state: AppStoreState) => state.updatePump);
  const [resettingPumpId, setResettingPumpId] = useState<number | null>(null);

  const highestWearPump = useMemo(
    () => [...pumps].sort((left, right) => right.running_hours - left.running_hours)[0] ?? null,
    [pumps]
  );

  const totalRunningHours = useMemo(() => pumps.reduce((sum, pump) => sum + pump.running_hours, 0), [pumps]);

  const resetPumpCounter = async (pumpId: number) => {
    const pump = pumps.find((item) => item.id === pumpId);
    if (!pump) {
      return;
    }

    try {
      setResettingPumpId(pumpId);
      const result = await updatePump({ ...pump, running_hours: 0 }, true);
      if (result) {
        toast.success(`${pump.name} running-hours counter reset.`);
      } else {
        toast.error(`Failed to reset ${pump.name} running-hours counter.`);
      }
    } finally {
      setResettingPumpId(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Device Overview</CardTitle>
            <CardDescription>
              Operational summary for pump aging, connectivity stability, and restart history.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/45 bg-gradient-to-br from-accent/20 via-card to-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <Activity className="size-4 text-muted-foreground" />
                  Runtime
                </div>
                <Badge variant="secondary">{pumps.length} pumps</Badge>
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Total running hours</span>
                  <Badge variant="secondary">{formatHours(totalRunningHours)}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Highest wear pump</span>
                  <Badge
                    variant={
                      highestWearPump?.running_hours && highestWearPump.running_hours > 1000 ? 'destructive' : 'outline'
                    }
                  >
                    {highestWearPump ? highestWearPump.name : 'N/A'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Last reboot reason</span>
                  <Badge variant="outline">{deviceStatus.last_reboot_reason || 'Unknown'}</Badge>
                </div>
              </div>
            </div>

            <Alert className="border-white/45 bg-gradient-to-br from-card via-card to-accent/10 shadow-sm">
              <TimerReset />
              <AlertTitle>Aging control</AlertTitle>
              <AlertDescription>
                Running hours are intended for service intervals and tubing/head aging. Reset a counter after
                maintenance, not after every refill.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="grid gap-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <PumpControl pumps={pumps} />

            <div className="grid gap-6">
              <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
                <CardHeader>
                  <CardTitle className="text-lg">Connectivity Stability</CardTitle>
                  <CardDescription>
                    Use these counters to spot weak Wi-Fi links or noisy local network conditions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="rounded-2xl border border-white/45 bg-gradient-to-br from-card via-card to-secondary/30 p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Wifi className="size-4 text-primary" />
                      Wi-Fi health
                    </div>
                    <div className="grid gap-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Mode</span>
                        <span className="font-medium">{deviceStatus.wifi_mode}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Disconnects</span>
                        <Badge variant={deviceStatus.wifi_disconnects > 10 ? 'destructive' : 'secondary'}>
                          {deviceStatus.wifi_disconnects}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Packets dropped</span>
                        <Badge variant={deviceStatus.packets_dropped > 250 ? 'destructive' : 'outline'}>
                          {formatPackets(deviceStatus.packets_dropped)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/45 bg-gradient-to-br from-card via-card to-secondary/20 p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Router className="size-4 text-primary" />
                      Traffic counters
                    </div>
                    <div className="grid gap-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">TX packets</span>
                        <span className="font-medium">{formatPackets(deviceStatus.tx_packets)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">RX packets</span>
                        <span className="font-medium">{formatPackets(deviceStatus.rx_packets)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
                <CardHeader>
                  <CardTitle className="text-lg">System</CardTitle>
                  <CardDescription>
                    Boot and firmware information for diagnosing crash loops, brownouts, or watchdog resets.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <RefreshCcw className="size-4" />
                      Reboot count
                    </span>
                    <Badge variant="secondary">{deviceStatus.reboot_count}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <ShieldAlert className="size-4" />
                      Last reason
                    </span>
                    <span className="max-w-[220px] truncate font-medium">{deviceStatus.last_reboot_reason}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Cpu className="size-4" />
                      Firmware
                    </span>
                    <span className="font-medium">{deviceStatus.firmware_version}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Build date</span>
                    <span className="font-medium">{deviceStatus.firmware_date}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-medium">{deviceStatus.up_time}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
            <CardHeader>
              <CardTitle className="text-xl">Pump Aging</CardTitle>
              <CardDescription>
                Track head wear and reset the running-hours counter after replacing tubing, rotor, or dosing line
                components.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-4">
                {pumps.map((pump) => {
                  const percentage =
                    pump.tank_full_vol > 0 ? Math.round((pump.tank_current_vol / pump.tank_full_vol) * 100) : 0;
                  const warning = pump.running_hours >= 1000;

                  return (
                    <Card
                      key={pump.id}
                      className={cn(
                        'overflow-hidden border-white/45 bg-gradient-to-br from-card via-card to-secondary/25 shadow-md',
                        warning && 'to-destructive/10'
                      )}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-col gap-2">
                            <CardTitle className="text-lg">{pump.name}</CardTitle>
                            <CardDescription className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{percentage}% full</Badge>
                              <Badge variant={pump.state ? 'default' : 'outline'}>
                                {pump.state ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </CardDescription>
                          </div>
                          <Badge variant={warning ? 'destructive' : 'outline'}>{formatHours(pump.running_hours)}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            <span>Wear estimate</span>
                            <span>{pump.running_hours >= 1000 ? 'Service suggested' : 'Nominal'}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                'h-full rounded-full bg-gradient-to-r transition-all',
                                warning ? 'from-destructive to-destructive/70' : 'from-primary via-primary/85 to-accent'
                              )}
                              style={{ width: `${Math.max(8, Math.min((pump.running_hours / 1200) * 100, 100))}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Current volume</span>
                            <span className="font-medium">{pump.tank_current_vol.toFixed(0)} ml</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Calibration points</span>
                            <span className="font-medium">{pump.calibration.length}</span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={resettingPumpId === pump.id}
                          onClick={() => resetPumpCounter(pump.id)}
                        >
                          <TimerReset data-icon="inline-start" />
                          {resettingPumpId === pump.id ? 'Resetting...' : 'Reset running hours'}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Home;
