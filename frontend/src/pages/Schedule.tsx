import React from 'react';
import { CalendarClock, ListChecks } from 'lucide-react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SCHEDULE_MODE } from '@/lib/api.ts';
import {
  formatRpm,
  formatVolumePerDay,
  getPumpScheduleHeadline,
} from '@/components/schedule-utils';
import { cn } from '@/lib/utils';

const Schedule: React.FC = (): React.ReactElement => {
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const firstPumpId = pumps[0]?.id;
  const [selectedPumpId, setSelectedPumpId] = React.useState<number | undefined>(firstPumpId);

  React.useEffect(() => {
    if (pumps.length === 0) {
      setSelectedPumpId(undefined);
      return;
    }
    const selectedStillExists =
      selectedPumpId !== undefined && pumps.some((pump) => pump.id === selectedPumpId);
    if (!selectedStillExists) {
      setSelectedPumpId(pumps[0].id);
    }
  }, [pumps, selectedPumpId]);

  const selectedPump = pumps.find((p) => p.id === selectedPumpId);

  const scheduleStats = React.useMemo(() => {
    const active = pumps.filter((p) => p.schedule.mode !== SCHEDULE_MODE.OFF).length;
    const dailyMl = pumps
      .filter((p) => p.schedule.mode === SCHEDULE_MODE.PERIODIC)
      .reduce((sum, p) => sum + p.schedule.volume, 0);
    const continuous = pumps.filter((p) => p.schedule.mode === SCHEDULE_MODE.CONTINUOUS);
    return { active, dailyMl, continuous };
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
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-5 text-primary" />
                  <CardTitle className="text-lg">Schedule</CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {scheduleStats.active}/{pumps.length} active
                  </Badge>
                  {scheduleStats.dailyMl > 0 && (
                    <Badge variant="secondary" className="text-xs tabular-nums">
                      {formatVolumePerDay(scheduleStats.dailyMl)}
                    </Badge>
                  )}
                  {scheduleStats.continuous.length > 0 && (
                    <Badge variant="secondary" className="text-xs tabular-nums">
                      {scheduleStats.continuous.length} continuous
                    </Badge>
                  )}
                </div>
              </div>

              {/* Pump selector */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {pumps.map((pump) => {
                  const isSelected = pump.id === selectedPumpId;

                  return (
                    <button
                      key={pump.id}
                      type="button"
                      onClick={() => setSelectedPumpId(pump.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm font-medium transition-all',
                        isSelected
                          ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                          : 'border-border/50 bg-secondary/10 text-muted-foreground hover:bg-secondary/20 hover:text-foreground',
                      )}
                    >
                      {pump.name}
                      <span className="ml-1.5 text-[10px] opacity-60">
                        {pump.schedule.mode === SCHEDULE_MODE.OFF
                          ? 'off'
                          : pump.schedule.mode === SCHEDULE_MODE.CONTINUOUS
                            ? formatRpm(pump.schedule.speed)
                            : getPumpScheduleHeadline(pump)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent>
              {selectedPump && (
                <ScheduleForm key={selectedPump.id} pump={selectedPump} success={() => {}} />
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
};

export default Schedule;
