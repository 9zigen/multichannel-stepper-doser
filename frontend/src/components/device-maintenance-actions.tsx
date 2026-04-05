import React from 'react';
import { LoaderCircle, RotateCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type DeviceMaintenanceActionsProps = {
  restartLabel?: string;
  factoryResetLabel?: string;
  restartDescription?: string;
  factoryResetDescription?: string;
  className?: string;
};

export function DeviceMaintenanceActions({
  restartLabel = 'Restart device',
  factoryResetLabel = 'Factory reset',
  restartDescription = 'Apply pending changes and restart the controller.',
  factoryResetDescription = 'Erase saved configuration and return the controller to its default state.',
  className,
}: DeviceMaintenanceActionsProps): React.ReactElement {
  const restartDevice = useAppStore((state: AppStoreState) => state.restartDevice);
  const factoryResetDevice = useAppStore((state: AppStoreState) => state.factoryResetDevice);
  const [isRestarting, setIsRestarting] = React.useState(false);
  const [isFactoryResetting, setIsFactoryResetting] = React.useState(false);

  const handleRestart = async () => {
    try {
      setIsRestarting(true);
      const success = await restartDevice();
      if (success) {
        toast.success('Device restart requested.');
      } else {
        toast.error('Failed to restart device.');
      }
    } finally {
      setIsRestarting(false);
    }
  };

  const handleFactoryReset = async () => {
    try {
      setIsFactoryResetting(true);
      const success = await factoryResetDevice();
      if (success) {
        toast.success('Factory reset requested. Sign in again after the device comes back online.');
      } else {
        toast.error('Failed to factory reset device.');
      }
    } finally {
      setIsFactoryResetting(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={isRestarting || isFactoryResetting}>
              {isRestarting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RotateCcw data-icon="inline-start" />}
              {restartLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <RotateCcw />
              </AlertDialogMedia>
              <AlertDialogTitle>Restart device</AlertDialogTitle>
              <AlertDialogDescription>
                {restartDescription} The controller may be unavailable for a short time while services reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRestarting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRestart} disabled={isRestarting}>
                {isRestarting ? 'Restarting...' : 'Restart now'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" disabled={isRestarting || isFactoryResetting}>
              {isFactoryResetting ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : (
                <ShieldAlert data-icon="inline-start" />
              )}
              {factoryResetLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <ShieldAlert />
              </AlertDialogMedia>
              <AlertDialogTitle>Factory reset device</AlertDialogTitle>
              <AlertDialogDescription>
                {factoryResetDescription} This removes saved network and service configuration and logs you out of the
                current session.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isFactoryResetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleFactoryReset} disabled={isFactoryResetting}>
                {isFactoryResetting ? 'Resetting...' : 'Reset device'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
