import React from 'react';
import { CalendarDays, Clock3, Droplets } from 'lucide-react';

import type { PumpHistoryDay } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  flagTitle,
  formatHourLabel,
  formatRuntime,
  formatShortDate,
  getActiveHours,
  getDayRuntime,
  getDayVolume,
  parseHistoryDate,
  renderFlags,
} from './utils';

type DayDetailProps = {
  day: PumpHistoryDay | null;
};

const DayDetail = ({ day }: DayDetailProps): React.ReactElement => {
  if (!day) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
        Select a day on the heatmap.
      </div>
    );
  }

  const activeHours = getActiveHours(day);
  const dayDate = parseHistoryDate(day.date);
  const totalVolume = getDayVolume(day);
  const totalRuntime = getDayRuntime(day);

  if (activeHours.length === 0) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2">
        <Badge variant="outline">{formatShortDate(dayDate)}</Badge>
        <span className="text-xs text-muted-foreground">No activity recorded.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Day summary header */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <CalendarDays className="size-3" />
          {formatShortDate(dayDate)}
        </Badge>
        <Badge variant="outline" className="gap-1 tabular-nums">
          <Droplets className="size-3" />
          {totalVolume} ml
        </Badge>
        <Badge variant="outline" className="gap-1 tabular-nums">
          <Clock3 className="size-3" />
          {Math.round(totalRuntime / 60)} min
        </Badge>
        <Badge variant="outline" className="tabular-nums">
          {activeHours.length}h active
        </Badge>
      </div>

      {/* Hourly table */}
      <ScrollArea className="w-full">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="whitespace-nowrap py-1.5 pr-3 text-left font-medium">Hour</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Total</th>
              <th className="hidden whitespace-nowrap px-2 py-1.5 text-right font-medium sm:table-cell">Sched</th>
              <th className="hidden whitespace-nowrap px-2 py-1.5 text-right font-medium sm:table-cell">Manual</th>
              <th className="whitespace-nowrap pl-2 py-1.5 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {activeHours.map((hour, index) => {
              const hourTotal = hour.scheduled_volume_ml + hour.manual_volume_ml;
              const flags = renderFlags(hour.flags);

              return (
                <tr
                  key={hour.hour}
                  className="animate-fade-in-up border-b border-border/30 last:border-0"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="whitespace-nowrap py-1.5 pr-3 font-medium tabular-nums">
                    {formatHourLabel(hour.hour)}
                    {flags.length > 0 && (
                      <span className="ml-1 text-[9px] text-muted-foreground" title={flagTitle(hour.flags)}>{flags.join('')}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <span className="font-semibold tabular-nums">{hourTotal}</span>
                    <span className="text-muted-foreground"> ml</span>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-1.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                    {hour.scheduled_volume_ml}
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-1.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                    {hour.manual_volume_ml}
                  </td>
                  <td className="whitespace-nowrap pl-2 py-1.5 text-right text-muted-foreground tabular-nums">
                    {formatRuntime(hour.total_runtime_s)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

export default DayDetail;
