import React from 'react';
import { Activity, CalendarDays, Clock3, Droplets, Waves } from 'lucide-react';

import { getPumpsHistory, PumpHistoryDay, PumpHistoryPump, PumpHistoryState, PumpState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils.ts';

type PumpHistoryCardProps = {
  pumps: PumpState[];
};

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short' });

const formatHourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const parseHistoryDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const getDayTotalVolume = (day: PumpHistoryDay) =>
  day.hours.reduce((sum, hour) => sum + hour.scheduled_volume_ml + hour.manual_volume_ml, 0);

const getDayTotalRuntime = (day: PumpHistoryDay) => day.hours.reduce((sum, hour) => sum + hour.total_runtime_s, 0);

const getDayActivityScore = (day: PumpHistoryDay) =>
  day.hours.reduce((sum, hour) => sum + hour.scheduled_volume_ml + hour.manual_volume_ml, 0);

const getIntensityClass = (value: number, maxValue: number) => {
  if (value <= 0 || maxValue <= 0) {
    return 'bg-muted/40 text-muted-foreground/40';
  }

  const ratio = value / maxValue;

  if (ratio >= 0.85) {
    return 'bg-emerald-500/95 text-emerald-950';
  }

  if (ratio >= 0.55) {
    return 'bg-emerald-400/80 text-emerald-950';
  }

  if (ratio >= 0.3) {
    return 'bg-emerald-300/65 text-emerald-950';
  }

  return 'bg-emerald-200/50 text-emerald-950';
};

const renderFlags = (flags: number) => {
  const items: string[] = [];

  if (flags & 1) {
    items.push('Scheduled');
  }
  if (flags & 2) {
    items.push('Manual');
  }
  if (flags & 4) {
    items.push('Continuous');
  }
  if (flags & 8) {
    items.push('Calibration');
  }

  return items.length > 0 ? items : ['Idle'];
};

const getTodayStamp = () => Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);

const getLastHistoryDay = (days: PumpHistoryDay[]) => (days.length > 0 ? days[days.length - 1] : null);

const getWeekColumns = (days: PumpHistoryDay[]) => {
  const columns: PumpHistoryDay[][] = [];

  for (let index = 0; index < days.length; index += 7) {
    columns.push(days.slice(index, index + 7));
  }

  return columns;
};

const PumpHistorySkeleton = (): React.ReactElement => (
  <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
    <div className="rounded-2xl border border-white/45 bg-linear-to-br from-card via-card to-secondary/20 p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>
      <div className="space-y-4 overflow-x-auto">
        <div className="flex gap-2 pl-10">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-3 w-[72px]" />
          ))}
        </div>
        <div className="flex gap-3">
          <div className="grid grid-rows-7 gap-2 pt-0.5">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-7" />
            ))}
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, columnIndex) => (
              <div key={columnIndex} className="grid grid-rows-7 gap-2">
                {Array.from({ length: 7 }, (_, rowIndex) => (
                  <Skeleton key={rowIndex} className="size-4 rounded-[4px]" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-3 w-8" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="size-4 rounded-[4px]" />
          ))}
          <Skeleton className="h-3 w-8" />
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-white/45 bg-gradient-to-br from-card via-card to-accent/10 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-3 w-52" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-xl border border-white/40 bg-card/85 p-3">
            <Skeleton className="mb-2 h-3 w-20" />
            <Skeleton className="h-6 w-14" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-xl border border-white/35 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const PumpHistoryCard = ({ pumps }: PumpHistoryCardProps): React.ReactElement => {
  const [history, setHistory] = React.useState<PumpHistoryState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedPumpId, setSelectedPumpId] = React.useState<number | null>(pumps[0]?.id ?? null);
  const [selectedDayStamp, setSelectedDayStamp] = React.useState<number | null>(null);

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
        setSelectedDayStamp((current) => current ?? response.current_day_stamp ?? getTodayStamp());
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
  const selectedPump = React.useMemo<PumpHistoryPump | null>(() => {
    if (historyPumps.length === 0) {
      return null;
    }

    return historyPumps.find((pump) => pump.id === selectedPumpId) ?? historyPumps[0];
  }, [historyPumps, selectedPumpId]);

  React.useEffect(() => {
    if (!selectedPump) {
      return;
    }

    const hasSelectedDay = selectedPump.days.some((day) => day.day_stamp === selectedDayStamp);
    if (!hasSelectedDay) {
      setSelectedDayStamp(getLastHistoryDay(selectedPump.days)?.day_stamp ?? null);
    }
  }, [selectedDayStamp, selectedPump]);

  const selectedDay = React.useMemo<PumpHistoryDay | null>(() => {
    if (!selectedPump) {
      return null;
    }

    return selectedPump.days.find((day) => day.day_stamp === selectedDayStamp) ?? getLastHistoryDay(selectedPump.days);
  }, [selectedDayStamp, selectedPump]);

  const weekColumns = React.useMemo(() => getWeekColumns(selectedPump?.days ?? []), [selectedPump]);

  const maxDayActivity = React.useMemo(() => {
    if (!selectedPump) {
      return 0;
    }

    return selectedPump.days.reduce((maxVolume, day) => Math.max(maxVolume, getDayActivityScore(day)), 0);
  }, [selectedPump]);

  const heatmapSummary = React.useMemo(() => {
    if (!selectedPump) {
      return { totalVolume: 0, activeDays: 0 };
    }

    return selectedPump.days.reduce(
      (summary, day) => ({
        totalVolume: summary.totalVolume + getDayActivityScore(day),
        activeDays: summary.activeDays + (getDayActivityScore(day) > 0 ? 1 : 0),
      }),
      { totalVolume: 0, activeDays: 0 }
    );
  }, [selectedPump]);

  const selectedPumpName = pumps.find((pump) => pump.id === selectedPump?.id)?.name ?? selectedPump?.name ?? 'Pump';

  return (
    <Card className="flex h-full flex-col overflow-hidden border-white/45 bg-card/82 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Dosing History</CardTitle>
        <CardDescription>
          Calendar-style activity map for the last 28 days with hourly drill-down for the selected date.
        </CardDescription>
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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
          <div className="rounded-2xl border border-white/45 bg-linear-to-br from-card via-card to-secondary/20 p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold">{selectedPumpName}</div>
                <div className="text-xs text-muted-foreground">
                  One cell per day. Intensity reflects total dosed volume for that date.
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="rounded-full border border-white/35 bg-card/80 px-3 py-1.5 text-muted-foreground">
                  28d volume <span className="ml-1 font-semibold text-foreground">{heatmapSummary.totalVolume} ml</span>
                </div>
                <div className="rounded-full border border-white/35 bg-card/80 px-3 py-1.5 text-muted-foreground">
                  Active days <span className="ml-1 font-semibold text-foreground">{heatmapSummary.activeDays}</span>
                </div>
              </div>
            </div>

            {loading ? (
              <PumpHistorySkeleton />
            ) : !selectedPump || selectedPump.days.length === 0 ? (
              <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                No dosing history available yet.
              </div>
            ) : (
              <div className="space-y-4 overflow-x-auto">
                <div className="flex min-w-[360px] gap-2 pl-10">
                  {weekColumns.map((column) => {
                    const firstDay = column[0];
                    const monthLabel = firstDay ? MONTH_FORMATTER.format(parseHistoryDate(firstDay.date)) : '';

                    return (
                      <div key={`month-${firstDay?.day_stamp ?? monthLabel}`} className="w-[72px] text-center text-xs text-muted-foreground">
                        {monthLabel}
                      </div>
                    );
                  })}
                </div>

                <div className="flex min-w-[360px] gap-3">
                  <div className="grid grid-rows-7 gap-2 pt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <div key={label} className="flex h-4 items-center">
                        {index === 2 || index === 4 || index === 6 ? label : ''}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    {weekColumns.map((column, columnIndex) => (
                      <div key={`week-${columnIndex}`} className="grid grid-rows-7 gap-2">
                        {WEEKDAY_LABELS.map((_, rowIndex) => {
                          const day = column[rowIndex];
                          if (!day) {
                            return <div key={`empty-${columnIndex}-${rowIndex}`} className="size-4 rounded-[4px] bg-transparent" />;
                          }

                          const totalVolume = getDayActivityScore(day);
                          const selected = day.day_stamp === selectedDay?.day_stamp;
                          const dayDate = parseHistoryDate(day.date);

                          return (
                            <button
                              key={day.day_stamp}
                              type="button"
                              title={`${day.date} · ${totalVolume} ml`}
                              className={cn(
                                'size-4 rounded-[4px] border border-black/5 transition hover:scale-110 hover:border-white/40',
                                getIntensityClass(totalVolume, maxDayActivity),
                                selected && 'ring-2 ring-primary/80 ring-offset-2 ring-offset-background'
                              )}
                              onClick={() => setSelectedDayStamp(day.day_stamp)}
                            >
                              <span className="sr-only">
                                {`${MONTH_FORMATTER.format(dayDate)} ${dayDate.getDate()} ${totalVolume} ml`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>Less</span>
                  <span className={cn('size-4 rounded-[4px]', getIntensityClass(0, maxDayActivity))} />
                  <span className={cn('size-4 rounded-[4px]', getIntensityClass(maxDayActivity * 0.2, maxDayActivity))} />
                  <span className={cn('size-4 rounded-[4px]', getIntensityClass(maxDayActivity * 0.45, maxDayActivity))} />
                  <span className={cn('size-4 rounded-[4px]', getIntensityClass(maxDayActivity * 0.7, maxDayActivity))} />
                  <span className={cn('size-4 rounded-[4px]', getIntensityClass(maxDayActivity, maxDayActivity))} />
                  <span>More</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/45 bg-gradient-to-br from-card via-card to-accent/10 p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Selected day</div>
                <div className="text-xs text-muted-foreground">
                  Hourly aggregates with trigger markers for debug and anomaly review.
                </div>
              </div>
              <Badge variant="secondary">{selectedDay?.date ?? 'No day selected'}</Badge>
            </div>

            {selectedDay ? (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/40 bg-card/85 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <Droplets className="size-3.5" />
                      Total volume
                    </div>
                    <div className="text-lg font-semibold">{getDayTotalVolume(selectedDay)} ml</div>
                  </div>
                  <div className="rounded-xl border border-white/40 bg-card/85 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      Runtime
                    </div>
                    <div className="text-lg font-semibold">{Math.round(getDayTotalRuntime(selectedDay) / 60)} min</div>
                  </div>
                  <div className="rounded-xl border border-white/40 bg-card/85 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      Active hours
                    </div>
                    <div className="text-lg font-semibold">
                      {selectedDay.hours.filter((hour) => hour.scheduled_volume_ml + hour.manual_volume_ml > 0).length}
                    </div>
                  </div>
                </div>

                <ScrollArea className="h-[360px] pr-3">
                  <div className="space-y-2">
                    {selectedDay.hours.map((hour) => {
                      const totalVolume = hour.scheduled_volume_ml + hour.manual_volume_ml;

                      return (
                        <div
                          key={hour.hour}
                          className={cn(
                            'rounded-xl border border-white/35 p-3',
                            totalVolume > 0 ? 'bg-card/90' : 'bg-muted/20'
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 font-medium">
                              <Activity className="size-4 text-primary" />
                              {formatHourLabel(hour.hour)}
                            </div>
                            <Badge variant={totalVolume > 0 ? 'secondary' : 'outline'}>
                              {totalVolume > 0 ? `${totalVolume} ml` : 'Idle'}
                            </Badge>
                          </div>
                          <div className="grid gap-2 text-sm text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                              <span>Scheduled</span>
                              <span className="font-medium text-foreground">{hour.scheduled_volume_ml} ml</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Manual</span>
                              <span className="font-medium text-foreground">{hour.manual_volume_ml} ml</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Runtime</span>
                              <span className="font-medium text-foreground">{hour.total_runtime_s} s</span>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {renderFlags(hour.flags).map((flag) => (
                                <Badge key={`${hour.hour}-${flag}`} variant="outline">
                                  <Waves className="mr-1 size-3" />
                                  {flag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                Select a pump to inspect hourly history.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PumpHistoryCard;
