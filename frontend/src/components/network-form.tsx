import React, { useEffect, useState } from 'react';

import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button.tsx';

import { NetworkState, NetworkType, scanWifiNetworks, WifiScanNetwork } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';

import {
  defaultsBle,
  defaultsCan,
  defaultsEthernet,
  defaultsThread,
  defaultsWifi,
} from '@/components/network-form/defaults.ts';
import { toast } from 'sonner';
import WifiIpv4Fields from '@/components/network-form/wifi-ipv4-fields.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { FormData } from './network-form/types.ts';
import EthernetIpv4Fields from "@/components/network-form/ethernet-ipv4-fields.tsx";

const FormSchema = z
  .object({
    id: z.number().optional(),
    ssid: z.string(),
    password: z.string().or(z.literal('')),
    keep_ap_active: z.boolean(),
    dhcp: z.boolean(),
    ip_address: z.ipv4().or(z.literal('')),
    mask: z.ipv4().or(z.literal('')),
    gateway: z.ipv4().or(z.literal('')),
    dns: z.ipv4().or(z.literal('')),
    type: z.number().lte(5),
  })
  .superRefine((data, ctx) => {
    if (data.type === NetworkType.WiFi && data.ssid.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ssid'],
        message: 'This field is required.',
      });
    }
  });

export interface NetworkFormProps {
  network: NetworkState | undefined;
  success?: () => void;
}

const defaults = [defaultsWifi, defaultsEthernet, defaultsBle, defaultsThread, defaultsCan];

const NetworkForm = (props: NetworkFormProps): React.ReactElement => {
  const { network } = props;
  const defaultValue = defaults.find((x) => x.type === network?.type);
  const [wifiNetworks, setWifiNetworks] = useState<WifiScanNetwork[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const updateNetwork = useAppStore((state: AppStoreState) => state.updateNetwork);
  const restartDevice = useAppStore((state: AppStoreState) => state.restartDevice);
  const [restartPromptOpen, setRestartPromptOpen] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  const { control, register, handleSubmit, watch, formState, setValue, setError } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaultValue,
  });

  useEffect(() => {
    if (network === undefined) {
      return;
    }

    if (network.type === NetworkType.WiFi) {
      setValue('ssid', network.ssid);
      setValue('password', network.password);
      setValue('keep_ap_active', network.keep_ap_active);
    } else {
      setValue('ssid', '');
      setValue('password', '');
      setValue('keep_ap_active', false);
    }

    if (network.type === NetworkType.WiFi || network.type === NetworkType.Ethernet) {
      setValue('dhcp', network.dhcp);
      setValue('ip_address', network.ip_address);
      setValue('mask', network.mask);
      setValue('gateway', network.gateway);
      setValue('dns', network.dns);
      setValue('dhcp', network.dhcp);
    }

    setValue('type', network.type);
  }, [network, setValue]);

  const handleScanWifi = async () => {
    if (network?.type !== NetworkType.WiFi || isScanning) {
      return;
    }

    try {
      setIsScanning(true);
      const response = (await scanWifiNetworks<{ networks: WifiScanNetwork[] }>()) as { networks: WifiScanNetwork[] };
      setWifiNetworks(response.networks);
    } catch (error) {
      toast.error('Wi-Fi scan failed.');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (network?.type !== NetworkType.WiFi) {
      setWifiNetworks([]);
      return;
    }

    void handleScanWifi();
  }, [network?.id, network?.type]);

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (!data.dhcp) {
      if (data.ip_address === '') {
        setError('ip_address', { message: 'IP address is required.' });
        return;
      }

      if (data.mask === '') {
        setError('mask', { message: 'Mask is required.' });
        return;
      }
    }

    try {
      if (network?.id !== undefined) {
        data.id = network?.id;
        const shouldPromptRestart = Boolean(network.is_dirty);
        const success = await updateNetwork(data as NetworkState);

        if (!success) {
          return toast.error('Network settings not saved.');
        }

        toast.success('Connection saved.');
        if (shouldPromptRestart) {
          setRestartPromptOpen(true);
        }
      } else {
        return toast.error('Network settings not saved.');
      }
    } catch (error) {
      const e = error as Error;
      toast.error(e.message);
    }
  };

  const typeSelected = watch('type');

  const renderFormFields = () => {
    switch (typeSelected) {
      case NetworkType.WiFi:
        return (
          <WifiIpv4Fields
            register={register}
            watch={watch}
            formState={formState}
            control={control}
            setValue={setValue}
            networkType={typeSelected}
            wifiNetworks={wifiNetworks}
            isScanning={isScanning}
            onScanWifi={() => void handleScanWifi()}
          />
        );

      case NetworkType.Ethernet: {
        return (
          <EthernetIpv4Fields
            register={register}
            watch={watch}
            formState={formState}
            control={control}
            setValue={setValue}
            networkType={typeSelected}
            isScanning={false}
            onScanWifi={() => undefined}
          />
        );
      }

      default:
        return null;
    }
  };

  return (
    <>
      <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit(onSubmit)}>
        {renderFormFields()}
        <Button type="submit" size="sm" className="w-full">
          Save connection
        </Button>
      </form>

      <AlertDialog open={restartPromptOpen} onOpenChange={setRestartPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart to apply the new connection?</AlertDialogTitle>
            <AlertDialogDescription>
              The connection profile was saved, but the controller should restart before the new network settings are
              fully applied.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestarting}>Later</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRestarting}
              onClick={async () => {
                try {
                  setIsRestarting(true);
                  const success = await restartDevice();
                  if (success) {
                    toast.success('Device restart requested.');
                    setRestartPromptOpen(false);
                  } else {
                    toast.error('Failed to restart device.');
                  }
                } finally {
                  setIsRestarting(false);
                }
              }}
            >
              {isRestarting ? 'Restarting...' : 'Restart now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default NetworkForm;
