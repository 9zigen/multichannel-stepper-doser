import React from "react";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {AppStoreState, useAppStore} from "@/hooks/use-store.ts";

type FormData = {
    username: string;
    password: string;
};

const FormSchema = z.object({
    username: z.string({required_error: "Login is required."}),
    password: z.string({required_error: "Password is required."}),
})

export function LoginForm({className, ...props}: React.ComponentPropsWithoutRef<"div">) {
    const {register, handleSubmit, formState: { errors }} = useForm<FormData>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            username: "",
            password: ""
        }
    });
    const loginError = useAppStore((state: AppStoreState) => state.error);
    const login = useAppStore((state: AppStoreState) => state.login);
    const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);

    const onSubmit: SubmitHandler<FormData> = async (data) => {
        const result = await login(data);
        if (result) {
            loadSettings()
        }
    };

    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <Card>
                <CardHeader className="text-center">
                    <CardTitle className="text-xl">Welcome back</CardTitle>
                    <CardDescription>
                        Login with your credentials
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
                        <div className="grid gap-6">
                            <div className="grid gap-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="username">User name</Label>
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="user name"
                                        {...register("username", { required: true })}
                                    />
                                    {errors.username && <p role="alert">{errors.username?.message}</p>}
                                </div>
                                <div className="grid gap-2">
                                    <div className="flex items-center">
                                        <Label htmlFor="password">Password</Label>
                                        <a
                                            href="#"
                                            className="ml-auto text-sm underline-offset-4 hover:underline"
                                        >
                                            Forgot your password?
                                        </a>
                                    </div>
                                    <Input
                                        id="password"
                                        type="password"
                                        {...register("password", { required: true })}
                                    />
                                    {errors.password && <p role="alert">{errors.password?.message}</p>}
                                </div>
                                {loginError && <p role="alert">{loginError}</p>}
                                <Button type="submit" className="w-full">
                                    Login
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}