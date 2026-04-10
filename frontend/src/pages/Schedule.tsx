import React from 'react';
import { ListChecks } from 'lucide-react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SCHEDULE_MODE } from '@/lib/api.ts';
import {
  formatRpm,
  formatVolumePerDay,
  getPumpScheduleDetails,
  getPumpScheduleHeadline,
  scheduleModeMeta,
} from '@/components/schedule-utils';

const SummaryStat = ({
  label,
  value,
  description,
}: {
  label: string;
  value: React.ReactNode;
  description: string;
}) => (
  <div className="-mx-4 rounded-2xl bg-linear-to-br from-card via-card to-secondary/30 px-4 py-4">
    <div className="text-sm font-medium text-foreground">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    <div className="mt-1 text-sm text-muted-foreground">{description}</div>
  </div>
);

const Schedule: React.FC = (): React.ReactElement => {
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const firstPumpId = pumps[0]?.id;
  const [selectedPumpId, setSelectedPumpId] = React.useState<string | undefined>(firstPumpId !== undefined ? String(firstPumpId) : undefined);

  React.useEffect(() => {
    if (pumps.length === 0) {
      setSelectedPumpId(undefined);
      return;
    }

    const selectedStillExists = selectedPumpId !== undefined && pumps.some((pump) => String(pump.id) === selectedPumpId);
    if (!selectedStillExists) {
      setSelectedPumpId(String(pumps[0].id));
    }
  }, [pumps, selectedPumpId]);

  const scheduleStats = React.useMemo(() => {
    const activePumps = pumps.filter((pump) => pump.schedule.mode !== SCHEDULE_MODE.OFF).length;
    const periodicDailyTarget = pumps
      .filter((pump) => pump.schedule.mode === SCHEDULE_MODE.PERIODIC)
      .reduce((sum, pump) => sum + pump.schedule.volume, 0);
    const continuousPumps = pumps.filter((pump) => pump.schedule.mode === SCHEDULE_MODE.CONTINUOUS);

    return {
      activePumps,
      periodicDailyTarget,
      continuousPumps,
      highestContinuousSpeed: continuousPumps.reduce((max, pump) => Math.max(max, pump.schedule.speed), 0),
    };
  }, [pumps]);

  return (
    <div className="flex flex-col gap-8 py-4 md:py-6">
      <section className="mx-auto grid w-full max-w-screen-2xl gap-6 px-4">
        {firstPumpId === undefined ? (
          <Card className="overflow-hidden border-border bg-card shadow-lg">
            <CardContent className="py-10">
              <Empty className="border-border bg-muted/20">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListChecks />
                  </EmptyMedia>
                  <EmptyTitle>No pumps available</EmptyTitle>
                  <EmptyDescription>Add or enable pumps in settings before configuring automatic schedules.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={selectedPumpId} onValueChange={setSelectedPumpId} className="gap-6">
            <Card className="overflow-hidden border-border bg-card shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Schedule Planner</CardTitle>
                <CardDescription>
                  Review every pump at a glance, then open one workspace to adjust mode, target, and timing.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <SummaryStat
                    label="Automatic pumps"
                    value={scheduleStats.activePumps}
                    description={`of ${pumps.length} pumps enabled`}
                  />
                  <SummaryStat
                    label="Periodic target"
                    value={formatVolumePerDay(scheduleStats.periodicDailyTarget)}
                    description="Combined daily volume across periodic schedules"
                  />
                  <SummaryStat
                    label="Continuous pumps"
                    value={scheduleStats.continuousPumps.length}
                    description={
                      scheduleStats.continuousPumps.length > 0
                        ? `Highest speed ${formatRpm(scheduleStats.highestContinuousSpeed)}`
                        : 'No continuous schedules configured'
                    }
                  />
                </div>

                <TabsList className="!grid h-auto w-full grid-cols-1 gap-3 bg-transparent p-0 md:grid-cols-2 xl:grid-cols-4">
                  {pumps.map((pump) => {
                    const mode = scheduleModeMeta[pump.schedule.mode];
                    const ModeIcon = mode.icon;

                    return (
                      <TabsTrigger
                        key={pump.id}
                        value={String(pump.id)}
                        className="h-auto flex-col items-stretch justify-start gap-0 rounded-2xl border border-border/70 bg-background px-0 py-0 text-left shadow-xs after:hidden hover:bg-secondary/20 data-active:border-primary/20 data-active:bg-secondary/35 data-active:text-foreground data-active:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3 px-4 pt-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-base font-medium text-foreground">{pump.name}</span>
                            <span className="text-sm text-muted-foreground">Pump #{pump.id}</span>
                          </div>
                          <Badge variant={mode.badgeVariant} className="gap-1 text-xs">
                            <ModeIcon className="size-3" />
                            {mode.label}
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
                          <div className="text-base font-medium text-foreground">{getPumpScheduleHeadline(pump)}</div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            {getPumpScheduleDetails(pump).join(' • ')}
                          </div>
                        </div>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </CardContent>
            </Card>

            {pumps.map((pump) => {
              const mode = scheduleModeMeta[pump.schedule.mode];
              const ModeIcon = mode.icon;

              return (
                <TabsContent key={pump.id} value={String(pump.id)} className="mt-0">
                  <Card className="overflow-hidden border-border bg-card shadow-lg">
                    <CardHeader>
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex flex-col gap-2">
                          <CardTitle className="text-lg">{pump.name} Schedule</CardTitle>
                          <CardDescription>{mode.description}</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant={mode.badgeVariant} className="gap-1.5">
                            <ModeIcon className="size-3.5" />
                            {mode.label}
                          </Badge>
                          <span>{getPumpScheduleDetails(pump).join(' • ')}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScheduleForm pump={pump} success={() => {}} />
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </section>
    </div>
  );
};

export default Schedule;
