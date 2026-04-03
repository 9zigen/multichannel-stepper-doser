import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import {Clock3, Globe2, RadioTower, RefreshCcw, Settings2} from 'lucide-react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import ServicesForm from '@/components/services-form';

const ServicesPage: React.FC = (): React.ReactElement => {
  const serviceState = useAppStore((state: AppStoreState) => state.settings.services);
  const mqttEndpoint = serviceState.mqtt_ip_address
    ? `${serviceState.mqtt_ip_address}${serviceState.mqtt_port ? `:${serviceState.mqtt_port}` : ''}`
    : 'Not configured';

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Service Overview</CardTitle>
            <CardDescription>
              Quick operational view of clock sync, broker connectivity, and OTA readiness.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <Globe2 className="size-4 text-muted-foreground" />
                  Hostname
                </div>
                <Badge variant="secondary">{serviceState.hostname}</Badge>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Clock3 className="size-4" />
                    NTP
                  </span>
                  <Badge variant={serviceState.enable_ntp ? 'default' : 'outline'}>
                    {serviceState.enable_ntp ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <RadioTower className="size-4" />
                    MQTT
                  </span>
                  <Badge variant={serviceState.enable_mqtt ? 'default' : 'outline'}>
                    {serviceState.enable_mqtt ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <RefreshCcw className="size-4" />
                    OTA
                  </span>
                  <Badge variant={serviceState.ota_url ? 'secondary' : 'outline'}>
                    {serviceState.ota_url ? 'Ready' : 'Missing URL'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6 text-sm">
              <div className="mb-2 font-medium">Current endpoints</div>
              <div className="grid gap-3 text-muted-foreground">
                <div>
                  <div className="text-xs uppercase tracking-wide">NTP server</div>
                  <div>{serviceState.ntp_server || 'Not configured'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide">Broker</div>
                  <div>{mqttEndpoint}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide">OTA source</div>
                  <div className="break-all">{serviceState.ota_url || 'Not configured'}</div>
                </div>
              </div>
            </div>

            <Alert className="p-4">
              <Settings2 />
              <AlertTitle>Useful IoT defaults</AlertTitle>
              <AlertDescription>
                Enable NTP for schedule accuracy, keep MQTT on the local broker, and host OTA binaries on a stable LAN
                address.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card className="w-full shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Services</CardTitle>
            <CardDescription>
              Split by role so network identity, clock sync, telemetry, and firmware delivery can be configured
              independently.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ServicesForm services={serviceState} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default ServicesPage;
