import React, { useMemo } from 'react';
import { Activity, TimerReset } from 'lucide-react';

import { PumpState, StatusState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type DeviceOverviewCardProps = {
  pumps: PumpState[];
  deviceStatus: StatusState;
};

const formatHours = (value: number) => `${value.toFixed(1)} h`;

const DeviceOverviewCard = ({ pumps, deviceStatus }: DeviceOverviewCardProps): React.ReactElement => {
  const highestWearPump = useMemo(
    () => [...pumps].sort((left, right) => right.running_hours - left.running_hours)[0] ?? null,
    [pumps]
  );

  const totalRunningHours = useMemo(() => pumps.reduce((sum, pump) => sum + pump.running_hours, 0), [pumps]);

  return (
    <Card className="flex h-full flex-col overflow-hidden border-white/45 bg-card/82 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Device Overview</CardTitle>
        <CardDescription>
          Operational summary for pump aging, connectivity stability, and restart history.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="rounded-2xl bg-linear-to-br from-card via-card to-secondary/30 p-4 -mx-4">
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
                  highestWearPump && highestWearPump.running_hours >= highestWearPump.aging.replace_hours
                    ? 'destructive'
                    : 'outline'
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

        <Alert className="border-white/10 bg-linear-to-br from-card via-card to-accent/10">
          <TimerReset />
          <AlertTitle>Aging control</AlertTitle>
          <AlertDescription>
            Running hours are intended for service intervals and tubing/head aging. Reset a counter after maintenance,
            not after every refill.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default DeviceOverviewCard;
