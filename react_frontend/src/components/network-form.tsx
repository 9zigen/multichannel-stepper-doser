import React from "react";

import {Controller, SubmitHandler, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";

import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label"

import { NetworkState } from "@/lib/api.ts";
import { AppStoreState, useAppStore } from "@/hooks/use-store.ts";
import { toast } from "sonner";

type FormData = {
    id: number;
    ssid: string;
    password: string;
    ip_address: string;
    mask: string;
    gateway: string;
    dns: string;
    dhcp: boolean;
};

const FormSchema = z
    .object({
        id: z.number(),
        ssid: z.string({required_error: "This field is required."}),
        password: z.string().or(z.literal('')),
        dhcp: z.boolean(),
        ip_address: z.string().ip().or(z.literal('')),
        mask: z.string().ip().or(z.literal('')),
        gateway: z.string().ip().or(z.literal('')),
        dns: z.string().ip().or(z.literal('')),
    })

export interface NetworkFormProps {
    network: NetworkState
    success: () => void
}

const NetworkForm = ({network, success}: NetworkFormProps): React.ReactElement => {
    const { id, ssid, password, dhcp, ip_address, mask, gateway, dns } = network;
    const updateNetwork = useAppStore((state: AppStoreState) => state.updateNetwork);

    const { control, register, handleSubmit, watch, formState: { errors }, setError } = useForm<FormData>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            id: id,
            ssid: ssid,
            password: password,
            dhcp: dhcp,
            ip_address: ip_address,
            mask: mask,
            gateway: gateway,
            dns: dns,
        }
    });

    const onSubmit: SubmitHandler<FormData> = async (data) => {
        if (!data.dhcp) {
            if (data.ip_address === '') {
                setError('ip_address', {message: 'IP address is required.'})
                return;
            }

            if (data.mask === '') {
                setError('mask', {message: 'Mask is required.'})
                return;
            }

        }

        if (await updateNetwork(data)) {
            toast.success("Network settings saved.")
            success();
        } else {
            toast.error("Network settings not saved.")
        }
    };

    const dhcp_actual = watch("dhcp")

    return (
        <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-row gap-4 mb-4">
                <div className="w-[50%]">
                    <div className="text-gray-500 pb-1">
                        <label>SSID</label>
                    </div>
                    <Input
                        type="text"
                        placeholder="WiFI SSID"
                        {...register("ssid")}
                    />
                    {errors.ssid && <p role="alert">{errors.ssid?.message}</p>}
                </div>

                <div className="w-[50%]">
                    <div className="text-gray-500 pb-1">
                        <label>Password</label>
                    </div>
                    <Input
                        type="string"
                        placeholder="WiFI Password"
                        {...register("password")}
                    />
                    {errors.password && <p role="alert">{errors.password?.message}</p>}
                </div>
            </div>

            <div className="flex mb-2 gap-2">
                <Controller
                    name="dhcp"
                    control={control}
                    render={({ field }) =>
                        <Switch id="dhcp-mode" checked={field.value} onCheckedChange={field.onChange} />}
                />
                <div className="text-gray-500">
                    <Label htmlFor="dhcp-mode">DHCP</Label>
                </div>
            </div>

            {
                !dhcp_actual ? (
                    <React.Fragment>
                        <div className="flex flex-row gap-4 mb-4">
                            <div className="w-[50%]">
                                <div className="text-gray-500 pb-1">
                                    <label>Static IP Address</label>
                                </div>

                                <Input
                                    type="text"
                                    placeholder="IP Address"
                                    {...register("ip_address")}
                                />
                                {errors.ip_address && <p role="alert">{errors.ip_address?.message}</p>}
                            </div>

                            <div className="w-[50%]">
                                <div className="text-gray-500 pb-1">
                                    <label>Mask</label>
                                </div>

                                <Input
                                    type="text"
                                    placeholder="Net Mask"
                                    {...register("mask")}
                                />
                                {errors.mask && <p role="alert">{errors.mask?.message}</p>}
                            </div>
                        </div>

                        <div className="flex flex-row gap-4 mb-4">
                            <div className="w-[50%]">
                                <div className="text-gray-500 pb-1">
                                    <label>Gateway</label>
                                </div>

                                <Input
                                    type="text"
                                    placeholder="Gateway"
                                    {...register("gateway")}
                                />
                                {errors.gateway && <p role="alert">{errors.gateway?.message}</p>}
                            </div>

                            <div className="w-[50%]">
                                <div className="text-gray-500 pb-1">
                                    <label>DNS</label>
                                </div>

                                <Input
                                    type="text"
                                    placeholder="Net Mask"
                                    {...register("dns")}
                                />
                                {errors.dns && <p role="alert">{errors.dns?.message}</p>}
                            </div>
                        </div>
                    </React.Fragment>
                ) : null
            }

            <div className="flex flex-row mt-8">
                <Button type="submit" className="w-full">Save</Button>
            </div>
        </form>
    );
};

export default NetworkForm;