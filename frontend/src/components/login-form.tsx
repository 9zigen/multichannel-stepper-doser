import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type FormData = {
  username: string;
  password: string;
};

const FormSchema = z.object({
  username: z.string().min(1, 'Login is required.'),
  password: z.string().min(1, 'Password is required.'),
});

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });
  const loginError = useAppStore((state: AppStoreState) => state.error);
  const login = useAppStore((state: AppStoreState) => state.login);
  const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    const result = await login(data);
    if (result) {
      const settings = await loadSettings();
      navigate(
        settings && !settings.app.onboarding_completed
          ? '/onboarding'
          : settings && settings.networks.length === 0
            ? '/settings/network'
            : '/',
        { replace: true }
      );
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Login with your credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="w-full" autoComplete="off" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-6">
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="username">User name</Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="off"
                    placeholder="user name"
                    {...register('username', { required: true })}
                  />
                  {errors.username && <p role="alert">{errors.username?.message}</p>}
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                    <a href="#" className="ml-auto text-sm underline-offset-4 hover:underline">
                      Forgot your password?
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    {...register('password', { required: true })}
                  />
                  {errors.password && <p role="alert">{errors.password?.message}</p>}
                </div>
                {loginError && (
                  <Alert variant="destructive">
                    <ShieldAlert />
                    <AlertTitle>Login failed</AlertTitle>
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full">
                  Login
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
