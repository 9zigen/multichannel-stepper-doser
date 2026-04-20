import React from 'react';
import { Wifi } from 'lucide-react';

import { StatusState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ConnectivityStabilityCardProps = {
  deviceStatus: StatusState;
};

const ConnectivityStabilityCard = ({
  deviceStatus,
}: ConnectivityStabilityCardProps): React.ReactElement => {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-primary" />
          <CardTitle className="text-base">Connectivity</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <div className="grid gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Mode</span>
            <span className="font-medium">{deviceStatus.wifi_mode}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Station</span>
            <span className="max-w-40 truncate font-medium">
              {deviceStatus.station_ssid || 'Not configured'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Link</span>
            <Badge variant={deviceStatus.station_connected ? 'default' : 'outline'} className="text-[10px]">
              {deviceStatus.station_connected ? 'Connected' : 'Idle'}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Station IP</span>
            <span className="font-medium tabular-nums">{deviceStatus.station_ip_address || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">AP</span>
            <span className="max-w-40 truncate font-medium">{deviceStatus.ap_ssid || 'Disabled'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">AP IP</span>
            <span className="font-medium tabular-nums">{deviceStatus.ap_ip_address || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Clients</span>
            <span className="font-medium tabular-nums">{deviceStatus.ap_clients}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Disconnects</span>
            <Badge variant={deviceStatus.wifi_disconnects > 10 ? 'destructive' : 'outline'} className="text-[10px] tabular-nums">
              {deviceStatus.wifi_disconnects}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectivityStabilityCard;
