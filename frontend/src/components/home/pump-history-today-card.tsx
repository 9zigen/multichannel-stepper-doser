import React from 'react';
import { Activity, ArrowRight, Clock3, Droplets } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { PumpHistoryPump, PumpState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator.tsx';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils.ts';
import { usePumpHistory } from './pump-history/use-pump-history';
import PumpSelector from './pump-history/pump-selector';
import { formatHourLabel, formatRuntime, getBarIntensityClass, getDayRuntime, getDayVolume, getHourVolume } from './pump-history/utils';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const getTodayFromPump = (pump: PumpHistoryPump | null, currentDayStamp: number | null) => {
  if (!pump || currentDayStamp === null) {
    return null;
  }

  return pump.days.find((day) => day.day_stamp === currentDayStamp) ?? pump.days[pump.days.length - 1] ?? null;
};

const TodaySkeleton = (): React.ReactElement => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-24" />
      <div className="flex gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="size-2.5 rounded-sm" />
        ))}
      </div>
    </div>
    <div className="grid grid-cols-12 gap-1">
      {Array.from({ length: 24 }, (_, i) => (
        <Skeleton key={i} className="h-5 rounded-[3px]" />
      ))}
    </div>
    <div className="space-y-2">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  </div>
);

const PumpHistoryTodayCard = ({ pumps }: { pumps: PumpState[] }): React.ReactElement => {
  const { history, loading, historyPumps, selectedPump, setSelectedPumpId } = usePumpHistory(pumps);

  const today = React.useMemo(
    () => getTodayFromPump(selectedPump, history?.current_day_stamp ?? null),
    [history?.current_day_stamp, selectedPump]
  );

  const maxHourVolume = React.useMemo(() => {
    if (!today) {
      return 0;
    }

    return today.hours.reduce((max, hour) => Math.max(max, getHourVolume(hour)), 0);
  }, [today]);

  const busiestHours = React.useMemo(() => {
    if (!today) {
      return [];
    }

    return today.hours
      .map((hour) => ({
        hour: hour.hour,
        volume: hour.scheduled_volume_ml + hour.manual_volume_ml,
        runtime: hour.total_runtime_s,
      }))
      .filter((hour) => hour.volume > 0)
      .sort((left, right) => right.volume - left.volume)
      .slice(0, 4);
  }, [today]);

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Today&apos;s Dosing</CardTitle>
        <CardDescription>Hourly activity for today.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <PumpSelector
          pumps={pumps}
          historyPumps={historyPumps}
          selectedPumpId={selectedPump?.id ?? null}
          onSelect={setSelectedPumpId}
        />

        {loading ? (
          <TodaySkeleton />
        ) : !today ? (
          <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
            No dosing activity available for today.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{today.date}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>Low</span>
                <span className="size-2.5 rounded-sm bg-emerald-200" />
                <span className="size-2.5 rounded-sm bg-emerald-300" />
                <span className="size-2.5 rounded-sm bg-emerald-400" />
                <span className="size-2.5 rounded-sm bg-emerald-500" />
                <span>High</span>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-1">
              {HOURS.map((hour) => {
                const volume = today.hours[hour] ? getHourVolume(today.hours[hour]) : 0;

                return (
                  <div
                    key={hour}
                    title={`${formatHourLabel(hour)} · ${volume} ml`}
                    className={cn(
                      'animate-fade-in-up flex h-5 items-end justify-center rounded-[3px] text-[8px]',
                      getBarIntensityClass(volume, maxHourVolume),
                      volume > 0 ? 'text-emerald-950/70' : 'text-muted-foreground/50'
                    )}
                    style={{ animationDelay: `${hour * 20}ms` }}
                  >
                    {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Droplets className="size-3.5" />
                  Total volume
                </span>
                <span className="font-semibold">{getDayVolume(today)} ml</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  Runtime
                </span>
                <span className="font-semibold">{Math.round(getDayRuntime(today) / 60)} min</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Activity className="size-3.5" />
                  Active hours
                </span>
                <span className="font-semibold">{busiestHours.length}</span>
              </div>
            </div>

            {busiestHours.length > 0 && (
              <>
                <Separator />
                <div className="grid gap-3 text-sm">
                  <div className="text-xs text-muted-foreground">Busiest hours</div>
                  {busiestHours.map((hour, index) => (
                    <div key={hour.hour} className="animate-fade-in-up flex items-center justify-between text-sm" style={{ animationDelay: `${index * 50}ms` }}>
                      <span className="font-medium">{formatHourLabel(hour.hour)}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{hour.volume} ml</Badge>
                        <span className="w-16 text-right text-xs text-muted-foreground">{formatRuntime(hour.runtime)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link to="/history">
            Open history
            <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PumpHistoryTodayCard;
