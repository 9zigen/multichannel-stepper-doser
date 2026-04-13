import React, { useMemo } from 'react';
import { Activity, Cpu, TimerReset } from 'lucide-react';

import { PumpState, StatusState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeviceMaintenanceActions } from '@/components/device-maintenance-actions';

type DeviceOverviewCardProps = {
  pumps: PumpState[];
  deviceStatus: StatusState;
};

const formatHours = (value: number) => `${value.toFixed(1)} h`;

const DeviceOverviewCard = ({ pumps, deviceStatus }: DeviceOverviewCardProps): React.ReactElement => {
  const highestWearPump = useMemo(
    () => [...pumps].sort((left, right) => right.running_hours - left.running_hours)[0] ?? null,
    [pumps],
  );

  const totalRunningHours = useMemo(() => pumps.reduce((sum, pump) => sum + pump.running_hours, 0), [pumps]);

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-primary" />
            <CardTitle className="text-lg">Device</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-xs tabular-nums">{pumps.length} pumps</Badge>
            <Badge variant="secondary" className="text-xs tabular-nums">{formatHours(totalRunningHours)}</Badge>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {deviceStatus.firmware_version}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Runtime */}
        <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="size-3.5 text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Runtime</span>
          </div>
          <div className="grid gap-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Total hours</span>
              <span className="font-medium tabular-nums">{formatHours(totalRunningHours)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Highest wear</span>
              <Badge
                variant={
                  highestWearPump && highestWearPump.running_hours >= highestWearPump.aging.replace_hours
                    ? 'destructive'
                    : 'outline'
                }
                className="text-[10px]"
              >
                {highestWearPump ? highestWearPump.name : 'N/A'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Last reboot</span>
              <span className="max-w-[140px] truncate text-right font-medium">{deviceStatus.last_reboot_reason || 'Unknown'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Reboots</span>
              <span className="font-medium tabular-nums">{deviceStatus.reboot_count}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Uptime</span>
              <span className="font-medium">{deviceStatus.up_time}</span>
            </div>
          </div>
        </div>

        {/* Aging note */}
        <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-secondary/10 p-3">
          <TimerReset className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Running hours track tubing wear. Reset after maintenance, not after refills.
          </p>
        </div>

        {/* Maintenance actions */}
        <div className="mt-auto rounded-lg border border-border/40 bg-secondary/10 p-3">
          <span className="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground">Maintenance</span>
          <DeviceMaintenanceActions className="[&_button]:h-8 [&_button]:text-xs [&>div]:flex-col [&>div]:sm:flex-row" />
        </div>
      </CardContent>
    </Card>
  );
};

export default DeviceOverviewCard;
