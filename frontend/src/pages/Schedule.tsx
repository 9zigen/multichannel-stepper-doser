import React from 'react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock, Clock3, Droplets, Waves } from 'lucide-react';
import { SCHEDULE_MODE } from '@/lib/api.ts';

const modeBadge = {
  [SCHEDULE_MODE.OFF]: { label: 'Off', variant: 'outline' as const, icon: Clock3 },
  [SCHEDULE_MODE.PERIODIC]: { label: 'Periodic', variant: 'secondary' as const, icon: CalendarClock },
  [SCHEDULE_MODE.CONTINUOUS]: { label: 'Continuous', variant: 'default' as const, icon: Waves },
};

const Schedule: React.FC = (): React.ReactElement => {
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const periodicCount = pumps.filter((pump) => pump.schedule.mode === SCHEDULE_MODE.PERIODIC).length;
  const continuousCount = pumps.filter((pump) => pump.schedule.mode === SCHEDULE_MODE.CONTINUOUS).length;

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Scheduler Overview</CardTitle>
            <CardDescription>
              Each pump can be disabled, run continuously, or follow a periodic dosing plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/45 bg-linear-to-br from-accent/20 via-card to-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  Active modes
                </div>
                <Badge variant="secondary">{pumps.length} pumps</Badge>
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Periodic plans</span>
                  <Badge variant="secondary">{periodicCount}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Continuous dosing</span>
                  <Badge variant="default">{continuousCount}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Disabled pumps</span>
                  <Badge variant="outline">{pumps.length - periodicCount - continuousCount}</Badge>
                </div>
              </div>
            </div>

            <Alert className="border-white/45 bg-linear-to-br from-card via-card to-accent/10 shadow-sm">
              <CalendarClock />
              <AlertTitle>Modern scheduling pattern</AlertTitle>
              <AlertDescription>
                Use visible mode chips instead of a dropdown. The operator should understand the state before opening
                the fine-grained controls.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Schedules</CardTitle>
            <CardDescription>
              Each card shows the current schedule mode first, then reveals only the controls relevant to that mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-1 2xl:grid-cols-2">
              {pumps?.map((pump) => {
                const percentage = (pump.tank_current_vol / pump.tank_full_vol) * 100;
                const mode = modeBadge[pump.schedule.mode];
                const ModeIcon = mode.icon;
                return (
                  <Card
                    key={pump.id}
                    className="overflow-hidden border-white/45 bg-linear-to-br from-card via-card to-secondary/30 shadow-md"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-2">
                          <CardTitle>{pump.name}</CardTitle>
                          <CardDescription className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              <Droplets data-icon="inline-start" />
                              {Math.round(percentage)}%
                            </Badge>
                            <Badge variant={mode.variant}>
                              <ModeIcon data-icon="inline-start" />
                              {mode.label}
                            </Badge>
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ScheduleForm pump={pump} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Schedule;
