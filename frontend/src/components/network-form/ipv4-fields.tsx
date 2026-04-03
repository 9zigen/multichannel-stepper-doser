import React from 'react';
import { Input } from '@/components/ui/input.tsx';
import { Controller, FormState, UseFormRegister, Control, UseFormWatch } from 'react-hook-form';
import { Switch } from '@/components/ui/switch.tsx';
import { Label } from '@/components/ui/label.tsx';
import { FormData } from './types.ts';

export interface Ipv4Props {
  formState: FormState<FormData>;
  register: UseFormRegister<FormData>;
  control: Control<FormData>;
  watch: UseFormWatch<FormData>;
}

const IPv4Fields = (props: Ipv4Props): React.ReactElement => {
  const { register, formState, control, watch } = props;
  const { errors } = formState;
  const dhcpSelected = watch('dhcp');

  return (
    <React.Fragment>
      <div className="flex flex-row gap-4 mb-4">
        <div className="w-[50%]">
          <div className=" pb-1">
            <label>SSID</label>
          </div>
          <Input type="text" placeholder="WiFI SSID" {...register('ssid')} />
          {errors.ssid && <p role="alert">{errors.ssid?.message}</p>}
        </div>

        <div className="w-[50%]">
          <div className=" pb-1">
            <label>Password</label>
          </div>
          <Input type="string" placeholder="WiFI Password" {...register('password')} />
          {errors.password && <p role="alert">{errors.password?.message}</p>}
        </div>
      </div>

      <div className="flex mb-4 gap-2">
        <Controller
          name="dhcp"
          control={control}
          render={({ field }) => <Switch id="dhcp-mode" checked={field.value} onCheckedChange={field.onChange} />}
        />
        <div className="">
          <Label htmlFor="dhcp-mode">DHCP</Label>
        </div>
      </div>

      {dhcpSelected ? null : (
        <React.Fragment>
          <div className="flex flex-row gap-4 mb-4">
            <div className="w-[50%]">
              <div className=" pb-1">
                <label>Static IP Address</label>
              </div>

              <Input type="text" placeholder="IP Address" {...register('ip_address')} />
              {errors.ip_address && <p role="alert">{errors.ip_address?.message}</p>}
            </div>

            <div className="w-[50%]">
              <div className="pb-1">
                <label>Mask</label>
              </div>

              <Input type="text" placeholder="Net Mask" {...register('mask')} />
              {errors.mask && <p role="alert">{errors.mask?.message}</p>}
            </div>
          </div>

          <div className="flex flex-row gap-4 mb-4">
            <div className="w-[50%]">
              <div className=" pb-1">
                <label>Gateway</label>
              </div>

              <Input type="text" placeholder="Gateway" {...register('gateway')} />
              {errors.gateway && <p role="alert">{errors.gateway?.message}</p>}
            </div>

            <div className="w-[50%]">
              <div className=" pb-1">
                <label>DNS</label>
              </div>

              <Input type="text" placeholder="Net Mask" {...register('dns')} />
              {errors.dns && <p role="alert">{errors.dns?.message}</p>}
            </div>
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
};

export default IPv4Fields;
