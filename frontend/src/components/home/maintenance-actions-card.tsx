import React from 'react';

import { DeviceMaintenanceActions } from '@/components/device-maintenance-actions';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';

const MaintenanceActionsCard = (): React.ReactElement => {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Maintenance Actions</CardTitle>
        <CardDescription>
          Apply network changes, reboot after service updates, or return the controller to a clean state.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="-mx-4 rounded-xl border border-border/30 bg-secondary/10 p-4">
        <div className="mb-2 text-sm font-medium">Controller operations</div>
          <p className="text-sm text-muted-foreground">
            Restart is safe for normal maintenance. Factory reset removes saved network and service configuration and
            requires signing in again.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <DeviceMaintenanceActions />
      </CardFooter>
    </Card>
  );
};

export default MaintenanceActionsCard;
