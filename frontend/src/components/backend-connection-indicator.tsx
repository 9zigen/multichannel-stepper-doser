import React from 'react';
import { WifiOff, PlugZap } from 'lucide-react';

import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useRealtimeConnection } from '@/components/realtime-provider.tsx';

const labels = {
  idle: 'Offline',
  connecting: 'Connecting',
  connected: 'Realtime',
  reconnecting: 'Reconnecting',
  paused: 'Paused',
} as const;

export function BackendConnectionIndicator(): React.ReactElement {
  const { status, reconnectNow } = useRealtimeConnection();

  if (status === 'connected') {
    return (
      <Badge variant="outline" className="gap-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
        <span className="size-2 rounded-full bg-emerald-500" />
        {labels[status]}
      </Badge>
    );
  }

  if (status === 'paused') {
    return (
      <Button variant="outline" size="sm" onClick={reconnectNow} className="gap-2">
        <WifiOff className="size-4" />
        {labels[status]}
      </Button>
    );
  }

  return (
    <Badge variant="outline" className="gap-2">
      <PlugZap className="size-4" />
      {labels[status]}
    </Badge>
  );
}
