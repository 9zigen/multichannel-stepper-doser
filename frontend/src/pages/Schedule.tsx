import React from 'react';
import { CalendarClock, ListChecks } from 'lucide-react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Badge } from '@/components/ui/badge';
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
          <div className="flex justify-center py-16">
            <Empty className="max-w-sm border-border bg-muted/20">
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
          </div>
        ) : (
          <>
            {/* Page header */}
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-5 text-primary" />
                <h1 className="text-lg font-semibold">Schedule</h1>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {scheduleStats.active}/{pumps.length} active
                </Badge>
                {scheduleStats.dailyMl > 0 && (
                  <Badge variant="outline" className="text-xs tabular-nums border-primary/30 bg-primary/5 text-primary">
                    {formatVolumePerDay(scheduleStats.dailyMl)}
                  </Badge>
                )}
                {scheduleStats.continuous.length > 0 && (
                  <Badge variant="outline" className="text-xs tabular-nums border-amber-400/40 bg-amber-400/5 text-amber-600 dark:text-amber-400">
                    {scheduleStats.continuous.length} continuous
                  </Badge>
                )}
              </div>
            </div>

            {/* Split layout — sidebar on desktop, strip on mobile */}
            <div className="flex flex-col gap-6 lg:flex-row">

              {/* Pump selector */}
              <aside className="lg:w-44 lg:shrink-0">
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
                  {pumps.map((pump) => {
                    const isSelected = pump.id === selectedPumpId;
                    const statusText =
                      pump.schedule.mode === SCHEDULE_MODE.OFF
                        ? 'off'
                        : pump.schedule.mode === SCHEDULE_MODE.CONTINUOUS
                          ? formatRpm(pump.schedule.speed)
                          : getPumpScheduleHeadline(pump);

                    return (
                      <button
                        key={pump.id}
                        type="button"
                        onClick={() => setSelectedPumpId(pump.id)}
                        className={cn(
                          'shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-all',
                          'lg:w-full lg:shrink lg:rounded-lg lg:px-3 lg:py-2.5 lg:text-left',
                          isSelected
                            ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                            : 'border-border/50 bg-secondary/10 text-muted-foreground hover:bg-secondary/20 hover:text-foreground',
                        )}
                      >
                        <span className="lg:block">{pump.name}</span>
                        <span
                          className={cn(
                            'ml-1.5 text-[10px] opacity-60',
                            'lg:ml-0 lg:mt-0.5 lg:block lg:tabular-nums',
                            isSelected ? 'lg:text-primary/70 lg:opacity-100' : '',
                          )}
                        >
                          {statusText}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* Vertical divider (desktop only) */}
              <div className="hidden lg:block lg:w-px lg:self-stretch lg:bg-border/30" />

              {/* Form — open, no card wrapper */}
              <main className="min-w-0 flex-1">
                {selectedPump && (
                  <ScheduleForm key={selectedPump.id} pump={selectedPump} success={() => {}} />
                )}
              </main>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default Schedule;
