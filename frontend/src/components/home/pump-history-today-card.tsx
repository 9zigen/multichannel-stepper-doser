import React from 'react';
import { Activity, ArrowRight, Clock3, Droplets } from 'lucide-react';
import { Link } from 'react-router-dom';

import { getPumpsHistory, PumpHistoryDay, PumpHistoryPump, PumpHistoryState, PumpState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils.ts';
import {Separator} from "@/components/ui/separator.tsx";

type PumpHistoryTodayCardProps = {
  pumps: PumpState[];
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const formatHourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const getTodayFromPump = (pump: PumpHistoryPump | null, currentDayStamp: number | null) => {
  if (!pump || currentDayStamp === null) {
    return null;
  }

  return pump.days.find((day) => day.day_stamp === currentDayStamp) ?? pump.days[pump.days.length - 1] ?? null;
};

const getHourVolume = (day: PumpHistoryDay, hour: number) => {
  const entry = day.hours[hour];
  if (!entry) {
    return 0;
  }

  return entry.scheduled_volume_ml + entry.manual_volume_ml;
};

const getDayVolume = (day: PumpHistoryDay) => day.hours.reduce((sum, hour) => sum + hour.scheduled_volume_ml + hour.manual_volume_ml, 0);

const getDayRuntime = (day: PumpHistoryDay) => day.hours.reduce((sum, hour) => sum + hour.total_runtime_s, 0);

const getBarClassName = (value: number, maxValue: number) => {
  if (value <= 0 || maxValue <= 0) {
    return 'bg-muted/80';
  }

  const ratio = value / maxValue;
  if (ratio >= 0.85) {
    return 'bg-emerald-500';
  }
  if (ratio >= 0.55) {
    return 'bg-emerald-400';
  }
  if (ratio >= 0.3) {
    return 'bg-emerald-300';
  }
  return 'bg-emerald-200';
};

const PumpHistoryTodaySkeleton = (): React.ReactElement => (
  <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
    <div className="rounded-2xl border border-white/45 bg-linear-to-br from-card via-card to-secondary/20 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-1">
          <Skeleton className="size-3 rounded-sm" />
          <Skeleton className="size-3 rounded-sm" />
          <Skeleton className="size-3 rounded-sm" />
          <Skeleton className="size-3 rounded-sm" />
        </div>
      </div>
      <div className="grid grid-cols-6 gap-x-2 gap-y-4">
        {HOURS.map((hour) => (
          <div key={hour} className="flex flex-col items-center gap-2">
            <Skeleton className="w-full rounded-t-[6px] rounded-b-[3px]" style={{ height: `${20 + ((hour * 11) % 80)}px` }} />
            <Skeleton className="h-2 w-4" />
          </div>
        ))}
      </div>
    </div>

    <div className="rounded-2xl border border-white/45 bg-gradient-to-br from-card via-card to-accent/10 p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-xl border border-white/35 bg-card/85 p-3">
            <Skeleton className="mb-2 h-3 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-xl border border-white/35 bg-card/85 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-14" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const PumpHistoryTodayCard = ({ pumps }: PumpHistoryTodayCardProps): React.ReactElement => {
  const [history, setHistory] = React.useState<PumpHistoryState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedPumpId, setSelectedPumpId] = React.useState<number | null>(pumps[0]?.id ?? null);

  React.useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        setLoading(true);
        const response = await getPumpsHistory<PumpHistoryState>();
        if (!active) {
          return;
        }

        setHistory(response);
        setSelectedPumpId((current) => current ?? response.pumps[0]?.id ?? null);
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const historyPumps = history?.pumps ?? [];
  const selectedPump = React.useMemo(() => {
    if (historyPumps.length === 0) {
      return null;
    }

    return historyPumps.find((pump) => pump.id === selectedPumpId) ?? historyPumps[0];
  }, [historyPumps, selectedPumpId]);

  const today = React.useMemo(
    () => getTodayFromPump(selectedPump, history?.current_day_stamp ?? null),
    [history?.current_day_stamp, selectedPump]
  );

  const maxHourVolume = React.useMemo(() => {
    if (!today) {
      return 0;
    }

    return today.hours.reduce((maxValue, _, hour) => Math.max(maxValue, getHourVolume(today, hour)), 0);
  }, [today]);

  const activeHours = React.useMemo(() => {
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
    <Card className="flex h-full flex-col overflow-hidden border-white/45 bg-card/82 shadow-lg">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Today&apos;s Dosing</CardTitle>
            <CardDescription>
              Compact hourly view for today. Open the full page for the retained 28-day history.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(historyPumps.length > 0 ? historyPumps : pumps).map((pump) => (
            <Button
              key={pump.id}
              type="button"
              size="sm"
              variant={pump.id === selectedPump?.id ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => setSelectedPumpId(pump.id)}
            >
              {pump.name}
            </Button>
          ))}
        </div>

        {loading ? (
          <PumpHistoryTodaySkeleton />
        ) : !today ? (
          <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
            No dosing activity available for today.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl  bg-linear-to-br from-card via-card to-secondary/20 p-4 -mx-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{today.date}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Low</span>
                  <span className="size-3 rounded-sm bg-emerald-200" />
                  <span className="size-3 rounded-sm bg-emerald-300" />
                  <span className="size-3 rounded-sm bg-emerald-400" />
                  <span className="size-3 rounded-sm bg-emerald-500" />
                  <span>High</span>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-x-2 gap-y-4">
                {HOURS.map((hour) => {
                  const volume = getHourVolume(today, hour);
                  const height = maxHourVolume > 0 ? Math.max(12, Math.round((volume / maxHourVolume) * 120)) : 12;

                  return (
                    <div key={hour} className="flex flex-col items-center gap-2">
                      <div
                        title={`${formatHourLabel(hour)} · ${volume} ml`}
                        className={cn(
                          'w-full rounded-t-[6px] rounded-b-[3px] transition-all',
                          getBarClassName(volume, maxHourVolume)
                        )}
                        style={{ height: `${height}px` }}
                      />
                      <span className="text-[10px] text-muted-foreground">{String(hour).padStart(2, '0')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="rounded-2xl bg-linear-to-br from-card via-card to-secondary/30 p-4 -mx-4">
              <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Droplets className="size-3.5" />
                    Total volume
                  </span>
                  <span className="font-medium">{getDayVolume(today)} ml</span>
                </div>
                
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    Runtime
                  </span>
                  <span className="font-medium">{Math.round(getDayRuntime(today) / 60)} min</span>
                </div>
                
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Activity className="size-3.5" />
                    Active hours
                  </span>
                  <span className="font-medium">{activeHours.length}</span>
                </div>
              </div>

              <Separator></Separator>
              
              <div className="mt-4 space-y-2">
                <span className="flex items-center gap-2 text-muted-foreground">Busiest hours</span>
                {activeHours.length > 0 ? (
                  activeHours.map((hour) => (
                    <div key={hour.hour} className="flex justify-between w-full">
                      <div className="flex">{formatHourLabel(hour.hour)}</div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{hour.volume} ml</Badge>
                        </div>
                        <div className="flex text-muted-foreground w-10">{hour.runtime}s</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/35 px-3 py-4 text-sm text-muted-foreground">
                    No active dosing hours recorded today yet.
                  </div>
                )}
              </div>
            </div>
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
