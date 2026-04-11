import React from 'react';
import { Cpu, RefreshCcw, ShieldAlert } from 'lucide-react';

import { StatusState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SystemCardProps = {
  deviceStatus: StatusState;
};

const SystemCard = ({ deviceStatus }: SystemCardProps): React.ReactElement => {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">System</CardTitle>
        <CardDescription>
          Boot and firmware information for diagnosing crash loops, brownouts, or watchdog resets.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid flex-1 gap-4">
        <div className="-mx-4 rounded-xl border border-border/30 bg-secondary/10 p-4">
          <div className="grid gap-3 text-sm">
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
              <span className="text-muted-foreground">Local time</span>
              <span className="font-medium">
                {deviceStatus.local_date || deviceStatus.local_time
                  ? `${deviceStatus.local_date || 'Unknown date'} ${deviceStatus.local_time || ''}`.trim()
                  : 'Unavailable'}
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Uptime</span>
              <span className="font-medium">{deviceStatus.up_time}</span>
            </div>
            
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Storage backend</span>
              <span className="font-medium">{deviceStatus.storage_backend || 'Unknown'}</span>
            </div>
            
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">RTC source</span>
              <span className="font-medium">{deviceStatus.rtc_backend || 'Unknown'}</span>
            </div>
            
            <div className="flex items-center justify-between gap-3">
            </div>
            
            <div className="flex items-center justify-between gap-3">
            </div>
            
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemCard;
