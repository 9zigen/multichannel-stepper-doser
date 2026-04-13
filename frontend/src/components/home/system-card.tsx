import React from 'react';
import { Cpu, HardDrive, Clock3 } from 'lucide-react';

import { StatusState } from '@/lib/api.ts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type SystemCardProps = {
  deviceStatus: StatusState;
};

const SystemCard = ({ deviceStatus }: SystemCardProps): React.ReactElement => {
  const localDateTime =
    deviceStatus.local_date || deviceStatus.local_time
      ? `${deviceStatus.local_date || '—'} ${deviceStatus.local_time || ''}`.trim()
      : 'Unavailable';

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-primary" />
          <CardTitle className="text-base">System</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <div className="grid gap-2 text-xs">
          {/* Firmware */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Firmware</span>
            <span className="font-medium">{deviceStatus.firmware_version}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Built</span>
            <span className="truncate font-medium tabular-nums">{deviceStatus.firmware_date}</span>
          </div>

          {/* Time */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock3 className="size-3" />
              Local time
            </span>
            <span className="truncate text-right font-medium tabular-nums">{localDateTime}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">RTC</span>
            <span className="font-medium">{deviceStatus.rtc_backend || 'Unknown'}</span>
          </div>

          {/* Storage */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HardDrive className="size-3" />
              Storage
            </span>
            <span className="font-medium">{deviceStatus.storage_backend || 'Unknown'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemCard;
