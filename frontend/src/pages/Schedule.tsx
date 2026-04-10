import React from 'react';
import { CalendarClock, Clock3, Waves } from 'lucide-react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SCHEDULE_MODE } from '@/lib/api.ts';

const modeConfig = {
  [SCHEDULE_MODE.OFF]: { label: 'Off', variant: 'outline' as const, icon: Clock3 },
  [SCHEDULE_MODE.PERIODIC]: { label: 'Periodic', variant: 'secondary' as const, icon: CalendarClock },
  [SCHEDULE_MODE.CONTINUOUS]: { label: 'Continuous', variant: 'default' as const, icon: Waves },
};

const Schedule: React.FC = (): React.ReactElement => {
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const firstPumpId = pumps[0]?.id;

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-6 px-4 md:px-4">
        <Card className="overflow-hidden border-border bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Pump Schedules</CardTitle>
            <CardDescription>
              Configure dosing mode for each pump.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {firstPumpId !== undefined && (
              <Tabs defaultValue={String(firstPumpId)}>
                <TabsList className="mb-6 h-auto w-full gap-1 rounded-xl bg-muted/60 p-1.5">
                  {pumps.map((pump) => {
                    const mode = modeConfig[pump.schedule.mode];
                    const ModeIcon = mode.icon;

                    return (
                      <TabsTrigger
                        key={pump.id}
                        value={String(pump.id)}
                        className="flex-1 flex-col gap-1.5 rounded-lg py-2.5 data-active:bg-background data-active:shadow-sm"
                      >
                        <span className="text-sm font-semibold">{pump.name}</span>
                        <Badge variant={mode.variant} className="gap-1 text-xs">
                          <ModeIcon className="size-3" />
                          {mode.label}
                        </Badge>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {pumps.map((pump) => (
                  <TabsContent key={pump.id} value={String(pump.id)}>
                    <ScheduleForm pump={pump} success={() => {}} />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Schedule;
