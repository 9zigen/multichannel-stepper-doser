import React, { useEffect } from 'react';

import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button.tsx';

import { NetworkState, NetworkType } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';

import {
  defaultsBle,
  defaultsCan,
  defaultsEthernet,
  defaultsThread,
  defaultsWifi,
} from '@/components/network-form/defaults.ts';
import { toast } from 'sonner';
import IPv4Fields from '@/components/network-form/ipv4-fields.tsx';

import { FormData } from './network-form/types.ts';

const FormSchema = z.object({
  id: z.number().optional(),
  ssid: z.string({ error: 'This field is required.' }),
  password: z.string().or(z.literal('')),
  dhcp: z.boolean(),
  ip_address: z.ipv4().or(z.literal('')),
  mask: z.ipv4().or(z.literal('')),
  gateway: z.ipv4().or(z.literal('')),
  dns: z.ipv4().or(z.literal('')),
  type: z.number().lte(5),
});

export interface NetworkFormProps {
  network: NetworkState | undefined;
  success?: () => void;
}

const defaults = [defaultsWifi, defaultsEthernet, defaultsBle, defaultsThread, defaultsCan];

const NetworkForm = (props: NetworkFormProps): React.ReactElement => {
  const { network } = props;
  const defaultValue = defaults.find((x) => x.type === network?.type);
  const updateNetwork = useAppStore((state: AppStoreState) => state.updateNetwork);

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
  }, [network]);

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
        await updateNetwork(data as NetworkState);
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
      case NetworkType.Ethernet: {
        return <IPv4Fields {...{ register, watch, formState, control }}></IPv4Fields>;
      }

      default:
        return null;
    }
  };

  return (
    <form className="w-full flex flex-col" onSubmit={handleSubmit(onSubmit)}>
      {renderFormFields()}
      <div className="flex flex-row mt-8">
        <Button type="submit" className="w-full duration-400 transition-all ease-in-out">
          Save connection
        </Button>
      </div>
    </form>
  );
};

export default NetworkForm;
