import React, {useEffect} from 'react';

import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Input } from '@/components/ui/input.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { NetworkState, NetworkType } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import settingsNetwork from '@/pages/Settings.Network.tsx';
import IPv4Fields from '@/components/network-form/ipv4-fields.tsx';

import { FormData } from './network-form/types.ts';

const FormSchema = z.object({
  id: z.number().optional(),
  ssid: z.string({ required_error: 'This field is required.' }),
  password: z.string().or(z.literal('')),
  dhcp: z.boolean(),
  ip_address: z.string().ip().or(z.literal('')),
  mask: z.string().ip().or(z.literal('')),
  gateway: z.string().ip().or(z.literal('')),
  dns: z.string().ip().or(z.literal('')),
  type: z.number().lte(5),
});

export interface NetworkFormProps {
  id?: number;
  isNew: boolean;
  type: NetworkType;
  success?: () => void;
}

const NetworkForm = (props: NetworkFormProps): React.ReactElement => {
  const { isNew, type, success } = props;
  
  const networks = useAppStore((state: AppStoreState) => state.settings.networks);
  const updateNetwork = useAppStore((state: AppStoreState) => state.updateNetwork);
  const addNetwork = useAppStore((state: AppStoreState) => state.addNetwork);

  const network = networks.find((n) => n.id === props.id);
  
  const defaults = {
    ssid: network?.ssid?? '',
    password: network?.password?? '',
    ip_address: network?.ip_address?? '0.0.0.0',
    mask: network?.mask?? '255.255.255.0',
    gateway: network?.gateway?? '0.0.0.0',
    dns: network?.dns?? '0.0.0.0',
    dhcp: network?.dhcp?? true,
    type: network?.type?? type,
  }
  
  const { control, register, handleSubmit, watch, formState, setValue, setError } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (network === undefined) {
      return;
    }
    
    setValue('ssid', network.ssid);
    setValue('password', network.password);
    setValue('dhcp', network.dhcp);
    setValue('ip_address', network.ip_address);
    setValue('mask', network.mask);
    setValue('gateway', network.gateway);
    setValue('dns', network.dns);
    setValue('dhcp', network.dhcp);
    setValue('type', network.type);
  }, [network]);
  
  const typeOptions = Object.keys(NetworkType)
    .filter((key) => key.length > 1)
    .map((key, idx) => ({
      label: key,
      value: idx,
    }));

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
      if (isNew) {
        addNetwork(data);
      } else if (network?.id !== undefined) {
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
      <div className="flex flex-row gap-4 mb-4 items-center">
        <div>
          <label>Type</label>
        </div>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Connection Type" />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((item) => (
                  <SelectItem key={item.value} value={String(item.value)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {renderFormFields()}

      <div className="flex flex-row mt-8">
        <Button type="submit" className="w-full duration-400 transition-all ease-in-out">
          {
            isNew? 'Add connection' : 'Save connection'
          }
        </Button>
      </div>
    </form>
  );
};

export default NetworkForm;
