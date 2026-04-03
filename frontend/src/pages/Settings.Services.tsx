import React from 'react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import ServicesForm from '@/components/services-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';

const ServicesPage: React.FC = (): React.ReactElement => {
  const serviceState = useAppStore((state: AppStoreState) => state.settings.services);

  return (
    <div className="flex flex-col items-center justify-center">
      <section className="container flex gap-6 px-6">
        <Card className="w-full shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>Device services settings</CardDescription>
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
