import React from 'react';

import { DeviceMaintenanceActions } from '@/components/device-maintenance-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const MaintenanceActionsCard = (): React.ReactElement => {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-white/45 bg-card/82 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Maintenance Actions</CardTitle>
        <CardDescription>
          Apply network changes, reboot after service updates, or return the controller to a clean state.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="rounded-2xl border border-white/45 bg-linear-to-br from-card via-card to-secondary/20 p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium">Controller operations</div>
          <p className="text-sm text-muted-foreground">
            Restart is safe for normal maintenance. Factory reset removes saved network and service configuration and
            requires signing in again.
          </p>
        </div>
        <div className="mt-auto">
          <DeviceMaintenanceActions />
        </div>
      </CardContent>
    </Card>
  );
};

export default MaintenanceActionsCard;
