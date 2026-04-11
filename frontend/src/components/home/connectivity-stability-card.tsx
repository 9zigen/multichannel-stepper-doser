import React from 'react';
import { Wifi } from 'lucide-react';

import { StatusState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ConnectivityStabilityCardProps = {
  deviceStatus: StatusState;
};

const ConnectivityStabilityCard = ({
  deviceStatus,
}: ConnectivityStabilityCardProps): React.ReactElement => {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Connectivity Stability</CardTitle>
        <CardDescription>
          Use these counters to spot weak Wi-Fi links or noisy local network conditions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid flex-1 gap-4">
        <div className="-mx-4 rounded-xl border border-border/30 bg-secondary/10 p-4">
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
              <span className="text-muted-foreground">Station SSID</span>
              <span className="max-w-[180px] truncate font-medium">
                {deviceStatus.station_ssid || 'Not configured'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Station link</span>
              <Badge variant={deviceStatus.station_connected ? 'default' : 'outline'}>
                {deviceStatus.station_connected ? 'Connected' : 'Idle'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Station IP</span>
              <span className="font-medium">{deviceStatus.station_ip_address || 'Unavailable'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">AP SSID</span>
              <span className="max-w-[180px] truncate font-medium">{deviceStatus.ap_ssid || 'Disabled'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">AP IP</span>
              <span className="font-medium">{deviceStatus.ap_ip_address || 'Unavailable'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">AP clients</span>
              <Badge variant={deviceStatus.ap_clients > 0 ? 'secondary' : 'outline'}>{deviceStatus.ap_clients}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Disconnects</span>
              <Badge variant={deviceStatus.wifi_disconnects > 10 ? 'destructive' : 'secondary'}>
                {deviceStatus.wifi_disconnects}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectivityStabilityCard;
