import React from 'react';
import { Control, FormState, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { NetworkType } from '@/lib/api.ts';

import { FormData } from './types.ts';
import CommonIPv4Fields from "@/components/network-form/common-ipv4-fields.tsx";

export interface Ipv4Props {
  formState: FormState<FormData>;
  register: UseFormRegister<FormData>;
  control: Control<FormData>;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  networkType: NetworkType;
  isScanning: boolean;
  onScanWifi: () => void;
}

const EthernetIPv4Fields = (props: Ipv4Props): React.ReactElement => {
  const { register, formState, networkType } = props;
  const { errors } = formState;
  const isEthernet = networkType === NetworkType.Ethernet;
  
  return (
    <div className="flex flex-col gap-3">
      {isEthernet ? (
        <>
          {/* VLAN Tag */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vlan" className="text-xs text-muted-foreground">VLAN Tag</Label>
              <Input id="vlan_tag" type="number" placeholder="no VLAN" className="h-8 text-sm" {...register('vlan_tag')} />
              {errors.vlan_tag && <p className="text-xs text-destructive" role="alert">{errors.vlan_tag.message}</p>}
            </div>
          </div>
        </>
      ) : null}

      <CommonIPv4Fields {...props}></CommonIPv4Fields>
    </div>
  );
};

export default EthernetIPv4Fields;
