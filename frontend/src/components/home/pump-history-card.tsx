import React from 'react';
import { CalendarDays, RotateCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { resetPumpsHistoryTodayScheduled } from '@/lib/api.ts';
import type { PumpHistoryDay, PumpHistoryResetResponse, PumpState } from '@/lib/api.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePumpHistory } from './pump-history/use-pump-history';
import PumpSelector from './pump-history/pump-selector';
import Heatmap from './pump-history/heatmap';
import DayDetail from './pump-history/day-detail';
import { HeatmapSkeleton, DayDetailSkeleton } from './pump-history/skeletons';
import { formatHistoryVolume, getDayVolume, isSaturatedDayVolume } from './pump-history/utils';

type PumpHistoryCardProps = {
  pumps: PumpState[];
};

const getLastDay = (days: PumpHistoryDay[]) => (days.length > 0 ? days[days.length - 1] : null);

const PumpHistoryCard = ({ pumps }: PumpHistoryCardProps): React.ReactElement => {
  const { history, loading, historyPumps, selectedPump, setSelectedPumpId, reloadHistory } = usePumpHistory(pumps);
  const [selectedDayStamp, setSelectedDayStamp] = React.useState<number | null>(null);
  const [isResettingToday, setIsResettingToday] = React.useState(false);

  React.useEffect(() => {
    if (!selectedPump) return;
    if (selectedDayStamp === null) {
      setSelectedDayStamp(getLastDay(selectedPump.days)?.day_stamp ?? null);
      return;
    }
    const hasSelectedDay = selectedPump.days.some((day) => day.day_stamp === selectedDayStamp);
    if (!hasSelectedDay) {
      setSelectedDayStamp(getLastDay(selectedPump.days)?.day_stamp ?? null);
    }
  }, [selectedDayStamp, selectedPump]);

  const selectedDay = React.useMemo<PumpHistoryDay | null>(() => {
    if (!selectedPump) return null;
    return selectedPump.days.find((day) => day.day_stamp === selectedDayStamp) ?? getLastDay(selectedPump.days);
  }, [selectedDayStamp, selectedPump]);

  const totalVolume = React.useMemo(
    () => selectedPump?.days.reduce((sum, day) => sum + getDayVolume(day), 0) ?? 0,
    [selectedPump],
  );

  const hasSaturatedVolume = React.useMemo(
    () => selectedPump?.days.some(isSaturatedDayVolume) ?? false,
    [selectedPump],
  );

  const activeDays = React.useMemo(
    () => selectedPump?.days.filter((day) => getDayVolume(day) > 0).length ?? 0,
    [selectedPump],
  );

  const isTodaySelected = selectedDay?.day_stamp === history?.current_day_stamp;

  const resetTodayScheduledHistory = async () => {
    if (!selectedPump || !isTodaySelected) {
      return;
    }

    try {
      setIsResettingToday(true);
      await resetPumpsHistoryTodayScheduled<PumpHistoryResetResponse>(selectedPump.id);
      await reloadHistory();
      toast.success(`${selectedPump.name} scheduled history reset for today.`);
    } catch (error) {
      console.error(error);
      toast.error('Scheduled history reset failed.');
    } finally {
      setIsResettingToday(false);
    }
  };

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="size-4 text-muted-foreground" />
            <CardTitle className="text-lg">History</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {formatHistoryVolume(totalVolume, hasSaturatedVolume)}
            </Badge>
            <Badge variant="outline" className="tabular-nums">{activeDays} active days</Badge>
            {selectedPump && selectedDay && isTodaySelected && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 border-amber-400/40 bg-amber-400/5 px-2 text-xs text-amber-900 hover:bg-amber-400/10 dark:text-amber-200"
                    disabled={loading || isResettingToday}
                  >
                    <RotateCcw className="size-3.5" />
                    Reset today
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <ShieldAlert className="size-4 text-amber-500" />
                      Reset today&apos;s scheduled history?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Reset today&apos;s scheduled dosing history for {selectedPump.name}? Manual dosing history will be
                      preserved. If the current hour is active, the schedule may dose again after the reset.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isResettingToday}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={resetTodayScheduledHistory} disabled={isResettingToday}>
                      {isResettingToday ? 'Resetting...' : 'Reset scheduled history'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        <PumpSelector
          pumps={pumps}
          historyPumps={historyPumps}
          selectedPumpId={selectedPump?.id ?? null}
          onSelect={setSelectedPumpId}
        />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          {/* Heatmap panel */}
          <div className="min-w-0 overflow-hidden rounded-lg border border-border/40 bg-secondary/10 p-3">
            {loading ? (
              <HeatmapSkeleton />
            ) : !selectedPump || selectedPump.days.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                No dosing history available yet.
              </div>
            ) : (
              <Heatmap
                days={selectedPump.days}
                selectedDay={selectedDay}
                onDaySelect={setSelectedDayStamp}
              />
            )}
          </div>

          {/* Day detail panel */}
          <div className="min-w-0 rounded-lg border border-border/40 bg-secondary/10 p-3">
            {loading ? <DayDetailSkeleton /> : <DayDetail day={selectedDay} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PumpHistoryCard;
