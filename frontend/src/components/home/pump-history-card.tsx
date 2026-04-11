import React from 'react';
import { CalendarDays } from 'lucide-react';

import type { PumpHistoryDay, PumpState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePumpHistory } from './pump-history/use-pump-history';
import PumpSelector from './pump-history/pump-selector';
import Heatmap from './pump-history/heatmap';
import DayDetail from './pump-history/day-detail';
import { HeatmapSkeleton, DayDetailSkeleton } from './pump-history/skeletons';
import { getDayVolume } from './pump-history/utils';

type PumpHistoryCardProps = {
  pumps: PumpState[];
};

const getLastDay = (days: PumpHistoryDay[]) => (days.length > 0 ? days[days.length - 1] : null);

const PumpHistoryCard = ({ pumps }: PumpHistoryCardProps): React.ReactElement => {
  const { loading, historyPumps, selectedPump, setSelectedPumpId } = usePumpHistory(pumps);
  const [selectedDayStamp, setSelectedDayStamp] = React.useState<number | null>(null);

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

  const activeDays = React.useMemo(
    () => selectedPump?.days.filter((day) => getDayVolume(day) > 0).length ?? 0,
    [selectedPump],
  );

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="size-4 text-muted-foreground" />
            <CardTitle className="text-lg">History</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">{totalVolume} ml</Badge>
            <Badge variant="outline" className="tabular-nums">{activeDays} active days</Badge>
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
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,auto)_minmax(0,1fr)]">
          {/* Heatmap panel */}
          <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
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
          <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
            {loading ? <DayDetailSkeleton /> : <DayDetail day={selectedDay} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PumpHistoryCard;
