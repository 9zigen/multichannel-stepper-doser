import React from 'react';

import type { PumpHistoryDay, PumpState } from '@/lib/api.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePumpHistory } from './pump-history/use-pump-history';
import PumpSelector from './pump-history/pump-selector';
import Heatmap from './pump-history/heatmap';
import DayDetail from './pump-history/day-detail';
import { HeatmapSkeleton, DayDetailSkeleton } from './pump-history/skeletons';

type PumpHistoryCardProps = {
  pumps: PumpState[];
};

const getLastDay = (days: PumpHistoryDay[]) => (days.length > 0 ? days[days.length - 1] : null);

const PumpHistoryCard = ({ pumps }: PumpHistoryCardProps): React.ReactElement => {
  const { loading, historyPumps, selectedPump, setSelectedPumpId } = usePumpHistory(pumps);
  const [selectedDayStamp, setSelectedDayStamp] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!selectedPump) {
      return;
    }

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
    if (!selectedPump) {
      return null;
    }

    return selectedPump.days.find((day) => day.day_stamp === selectedDayStamp) ?? getLastDay(selectedPump.days);
  }, [selectedDayStamp, selectedPump]);

  const selectedPumpName = pumps.find((pump) => pump.id === selectedPump?.id)?.name ?? selectedPump?.name ?? 'Pump';

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Dosing History</CardTitle>
        <CardDescription>
          Calendar-style activity map across the retained history with a compact drill-down for the selected date.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <PumpSelector
          pumps={pumps}
          historyPumps={historyPumps}
          selectedPumpId={selectedPump?.id ?? null}
          onSelect={setSelectedPumpId}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(220px,auto)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-linear-to-br from-card via-card to-secondary/20 p-4 shadow-sm">
            {loading ? (
              <HeatmapSkeleton />
            ) : !selectedPump || selectedPump.days.length === 0 ? (
              <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
                No dosing history available yet.
              </div>
            ) : (
              <Heatmap
                days={selectedPump.days}
                pumpName={selectedPumpName}
                selectedDay={selectedDay}
                onDaySelect={setSelectedDayStamp}
              />
            )}
          </div>

          <div className="rounded-2xl border border-border bg-linear-to-br from-card via-card to-accent/10 p-4 shadow-sm">
            {loading ? <DayDetailSkeleton /> : <DayDetail day={selectedDay} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PumpHistoryCard;
