import React from 'react';
import { ListChecks } from 'lucide-react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

const Schedule: React.FC = (): React.ReactElement => {
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const firstPumpId = pumps[0]?.id;
  const [selectedPumpId, setSelectedPumpId] = React.useState<string | undefined>(
    firstPumpId !== undefined ? String(firstPumpId) : undefined,
  );

  React.useEffect(() => {
    if (pumps.length === 0) {
      setSelectedPumpId(undefined);
      return;
    }
    const selectedStillExists =
      selectedPumpId !== undefined && pumps.some((pump) => String(pump.id) === selectedPumpId);
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
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        {firstPumpId === undefined ? (
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardContent className="py-10">
              <Empty className="border-border bg-muted/20">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListChecks />
                  </EmptyMedia>
                  <EmptyTitle>No pumps available</EmptyTitle>
                  <EmptyDescription>
                    Add or enable pumps in settings before configuring automatic schedules.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={selectedPumpId} onValueChange={setSelectedPumpId}>
            <div className="grid gap-6 xl:grid-cols-12">
              {/* Left: Pump list */}
              <div className="xl:col-span-4">
                <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Schedule Planner</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    {/* Stats strip */}
                    <div className="-mx-4 rounded-xl border border-border/30 bg-secondary/10 px-4 py-2.5">
                      <div className="grid grid-cols-3 divide-x divide-border/40">
                        <div className="flex flex-col items-center gap-0.5 pr-2">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {scheduleStats.activePumps}/{pumps.length}
                          </span>
                          <span className="text-xs text-muted-foreground">Active</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 px-2">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {formatVolumePerDay(scheduleStats.periodicDailyTarget)}
                          </span>
                          <span className="text-xs text-muted-foreground">Periodic</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 pl-2">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {scheduleStats.continuousPumps.length > 0
                              ? `${scheduleStats.continuousPumps.length} · ${formatRpm(scheduleStats.highestContinuousSpeed)}`
                              : 'None'}
                          </span>
                          <span className="text-xs text-muted-foreground">Continuous</span>
                        </div>
                      </div>
                    </div>

                    {/* Pump rows */}
                    <TabsList className="flex h-auto w-full flex-col gap-1.5 bg-transparent p-0">
                      {pumps.map((pump, index) => {
                        const mode = scheduleModeMeta[pump.schedule.mode];
                        const ModeIcon = mode.icon;
                        const isSelected = String(pump.id) === selectedPumpId;

                        return (
                          <TabsTrigger
                            key={pump.id}
                            value={String(pump.id)}
                            className={cn(
                              'h-auto min-h-0 w-full flex-none flex-row items-center justify-between gap-3 self-auto rounded-lg border px-3 py-2.5 text-left after:hidden animate-fade-in-up',
                              'border-border/40 bg-secondary/10 hover:bg-secondary/20',
                              'data-active:border-primary/30 data-active:bg-primary/5 data-active:text-foreground data-active:shadow-[0_0_12px_rgba(34,211,238,0.1)]',
                            )}
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div
                                className={cn(
                                  'flex size-8 shrink-0 items-center justify-center rounded-md',
                                  isSelected ? 'bg-primary/10' : 'bg-secondary/50',
                                )}
                              >
                                <ModeIcon
                                  className={cn(
                                    'size-4',
                                    isSelected ? 'text-primary' : 'text-muted-foreground',
                                  )}
                                />
                              </div>
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {pump.name}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {getPumpScheduleHeadline(pump)}
                                </span>
                              </div>
                            </div>
                            <Badge variant={mode.badgeVariant} className="shrink-0 text-xs">
                              {mode.label}
                            </Badge>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Schedule form */}
              <div className="xl:col-span-8">
                {pumps.map((pump) => {
                  const mode = scheduleModeMeta[pump.schedule.mode];
                  const ModeIcon = mode.icon;

                  return (
                    <TabsContent key={pump.id} value={String(pump.id)} className="mt-0">
                      <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
                        <CardHeader className="pb-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle className="text-lg">{pump.name}</CardTitle>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={mode.badgeVariant} className="gap-1.5">
                                <ModeIcon className="size-3.5" />
                                {mode.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {getPumpScheduleDetails(pump).join(' · ')}
                              </span>
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
              </div>
            </div>
          </Tabs>
        )}
      </section>
    </div>
  );
};

export default Schedule;
