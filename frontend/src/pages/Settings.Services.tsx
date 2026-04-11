import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Clock3, Globe2, RadioTower, RefreshCcw } from 'lucide-react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import ServicesForm from '@/components/services-form';

const ServicesPage: React.FC = (): React.ReactElement => {
  const serviceState = useAppStore((state: AppStoreState) => state.settings.services);

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Globe2 className="size-4 text-muted-foreground" />
                <CardTitle className="text-lg">Services</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  {serviceState.hostname || 'no hostname'}
                </Badge>
                <Badge variant={serviceState.enable_ntp ? 'default' : 'outline'} className="gap-1">
                  <Clock3 className="size-3" />
                  NTP {serviceState.enable_ntp ? 'on' : 'off'}
                </Badge>
                <Badge variant={serviceState.enable_mqtt ? 'default' : 'outline'} className="gap-1">
                  <RadioTower className="size-3" />
                  MQTT {serviceState.enable_mqtt ? 'on' : 'off'}
                </Badge>
                <Badge variant={serviceState.ota_url ? 'secondary' : 'outline'} className="gap-1">
                  <RefreshCcw className="size-3" />
                  OTA {serviceState.ota_url ? 'ready' : 'off'}
                </Badge>
              </div>
            </div>
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
