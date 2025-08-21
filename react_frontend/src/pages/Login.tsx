import { LoginForm } from "@/components/login-form"
import { Toaster } from "@/components/ui/sonner";
import React from "react";

const LoginPage: React.FC = (): React.ReactElement => {
    return (
        <>
            <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
                <div className="flex w-full max-w-sm flex-col gap-6">
                    <LoginForm />
                </div>
            </div>
            <Toaster />
        </>
    )
}

export default LoginPage
