import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Network, Route, ShieldAlert } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const OnboardingPage: React.FC = (): React.ReactElement => {
  const navigate = useNavigate();
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const settings = useAppStore((state: AppStoreState) => state.settings);
  const saveSettings = useAppStore((state: AppStoreState) => state.saveSettings);
  const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);
  const [username, setUsername] = useState(settings.auth.username);
  const [password, setPassword] = useState(settings.auth.password);
  const [isSavingAuth, setIsSavingAuth] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (settings.app.onboarding_completed) {
    return <Navigate to="/" replace />;
  }

  const hasNetwork = settings.networks.length > 0;
  const credentialsChanged = !(settings.auth.username === 'admin' && settings.auth.password === '12345678');

  const saveAuth = async () => {
    try {
      setIsSavingAuth(true);
      const success = await saveSettings('auth', {
        auth: {
          username,
          password,
        },
      });
      if (!success) {
        toast.error('Failed to save admin credentials.');
        return;
      }

      await loadSettings();
      toast.success('Admin credentials updated.');
    } finally {
      setIsSavingAuth(false);
    }
  };

  const completeOnboarding = async () => {
    if (!hasNetwork) {
      toast.error('Configure at least one network before finishing onboarding.');
      return;
    }

    try {
      setIsCompleting(true);
      const success = await saveSettings('app', {
        app: {
          onboarding_completed: true,
        },
      });
      if (!success) {
        toast.error('Failed to finish onboarding.');
        return;
      }

      await loadSettings();
      navigate('/', { replace: true });
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Initial Setup</CardTitle>
            <CardDescription>
              The controller was factory reset. Finish the first-run checklist, then the guided setup will stay hidden.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <Route className="size-4 text-muted-foreground" />
                  Setup progress
                </div>
                <Badge variant={hasNetwork ? 'default' : 'outline'}>{hasNetwork ? 'Ready to finish' : 'Pending'}</Badge>
              </div>

              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Admin credentials</span>
                  <Badge variant={credentialsChanged ? 'secondary' : 'outline'}>
                    {credentialsChanged ? 'Updated' : 'Default'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Network profile</span>
                  <Badge variant={hasNetwork ? 'default' : 'outline'}>
                    {hasNetwork ? `${settings.networks.length} configured` : 'Missing'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Board setup</span>
                  <Badge variant="outline">Optional</Badge>
                </div>
              </div>
            </div>

            {!credentialsChanged ? (
              <Alert className="p-4">
                <ShieldAlert />
                <AlertTitle>Default credentials still active</AlertTitle>
                <AlertDescription>
                  Login happens before onboarding for safety, but you should still change the default password before
                  handing the controller over to normal operation.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Step 1: Secure Admin Access</CardTitle>
              <CardDescription>Change the default login before the controller joins your normal network.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="onboarding_username">Username</FieldLabel>
                <FieldContent>
                  <Input id="onboarding_username" value={username} onChange={(event) => setUsername(event.target.value)} />
                  <FieldDescription>Keep `admin` if you only want to rotate the password.</FieldDescription>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="onboarding_password">Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="onboarding_password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <FieldDescription>Use a device-specific password before exposing this controller to your LAN.</FieldDescription>
                </FieldContent>
              </Field>
              <div className="md:col-span-2">
                <Button type="button" onClick={() => void saveAuth()} disabled={isSavingAuth || !username || !password}>
                  <KeyRound data-icon="inline-start" />
                  {isSavingAuth ? 'Saving...' : 'Save credentials'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Step 2: Configure Network</CardTitle>
              <CardDescription>Bring the device onto your intended network before marking onboarding complete.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">{hasNetwork ? 'Network profile configured' : 'No network profile yet'}</div>
                <div className="text-sm text-muted-foreground">
                  {hasNetwork
                    ? `The controller currently has ${settings.networks.length} configured network profile(s).`
                    : 'Open the network page to configure Wi-Fi or Ethernet access.'}
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => navigate('/settings/network?guided=1')}>
                <Network data-icon="inline-start" />
                Open network settings
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Optional: Board Wiring Review</CardTitle>
              <CardDescription>The board step is prefilled from defaults and can be skipped for now.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Open the board page in guided mode if your wiring differs from the stock configuration.
              </div>
              <Button type="button" variant="outline" onClick={() => navigate('/settings/board?guided=1')}>
                <Route data-icon="inline-start" />
                Review board defaults
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Finish</CardTitle>
              <CardDescription>Once the network is configured, this first-run page will stay hidden until the next factory reset.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" onClick={() => void completeOnboarding()} disabled={!hasNetwork || isCompleting}>
                <CheckCircle2 data-icon="inline-start" />
                {isCompleting ? 'Finishing...' : 'Complete onboarding'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/settings/network?guided=1')}>
                Return to network step
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default OnboardingPage;
