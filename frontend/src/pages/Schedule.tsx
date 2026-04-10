import React from 'react';
import { ChevronDown, CalendarClock, Clock3, Waves } from 'lucide-react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { SCHEDULE_MODE } from '@/lib/api.ts';

const modeConfig = {
  [SCHEDULE_MODE.OFF]: { label: 'Off', variant: 'outline' as const, icon: Clock3 },
  [SCHEDULE_MODE.PERIODIC]: { label: 'Periodic', variant: 'secondary' as const, icon: CalendarClock },
  [SCHEDULE_MODE.CONTINUOUS]: { label: 'Continuous', variant: 'default' as const, icon: Waves },
};

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const formatHourRange = (hours: number[]) => {
  if (hours.length === 0) {
    return 'No hours';
  }
  if (hours.length > 6) {
    return `${hours.length} hours`;
  }

  return hours
    .slice()
    .sort((a, b) => a - b)
    .map((h) => `${String(h).padStart(2, '0')}`)
    .join(', ');
};

const formatWeekdays = (days: number[]) => {
  if (days.length === 0) {
    return 'No days';
  }
  if (days.length === 7) {
    return 'Every day';
  }

  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => weekdayLabels[d])
    .join(', ');
};

const Schedule: React.FC = (): React.ReactElement => {
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const [openId, setOpenId] = React.useState<number | null>(pumps[0]?.id ?? null);

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-6 px-4 md:px-4">
        <Card className="overflow-hidden border-border bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Pump Schedules</CardTitle>
            <CardDescription>
              Configure dosing mode for each pump. Tap a row to expand its settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pumps.map((pump, index) => {
              const mode = modeConfig[pump.schedule.mode];
              const ModeIcon = mode.icon;
              const isOpen = openId === pump.id;

              return (
                <Collapsible
                  key={pump.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${index * 60}ms` }}
                  open={isOpen}
                  onOpenChange={(open) => setOpenId(open ? pump.id : null)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-4 rounded-xl border border-border bg-gradient-to-br from-card via-card to-secondary/20 px-4 py-3 text-left transition-all hover:bg-accent/5',
                        isOpen && 'rounded-b-none border-b-0 bg-accent/5'
                      )}
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <span className="text-sm font-semibold">{pump.name}</span>
                        <Badge variant={mode.variant} className="gap-1 text-xs">
                          <ModeIcon className="size-3" />
                          {mode.label}
                        </Badge>
                      </div>

                      <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                        {pump.schedule.mode === SCHEDULE_MODE.PERIODIC && (
                          <>
                            <span>{pump.schedule.volume} ml/day</span>
                            <span>{pump.schedule.speed} rpm</span>
                            <span>{formatHourRange(pump.schedule.work_hours)}</span>
                            <span>{formatWeekdays(pump.schedule.weekdays)}</span>
                          </>
                        )}
                        {pump.schedule.mode === SCHEDULE_MODE.CONTINUOUS && (
                          <span>{pump.schedule.speed} rpm</span>
                        )}
                      </div>

                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform',
                          isOpen && 'rotate-180'
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                    <div className="rounded-b-xl border border-t-0 border-border bg-gradient-to-br from-card via-card to-secondary/10 px-4 pb-4 pt-2">
                      <ScheduleForm pump={pump} success={() => {}} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Schedule;
