import React from 'react';
import { CalendarDays, Clock3, Droplets, Info } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { PumpHistoryDay } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  flagTitle,
  formatCompactHourVolume,
  formatDayVolume,
  formatHourLabel,
  formatHourVolume,
  formatRuntime,
  formatShortDate,
  formatStoredHistoryVolume,
  getActiveHours,
  getDayRuntime,
  parseHistoryDate,
  renderFlags,
} from './utils';

type DayDetailProps = {
  day: PumpHistoryDay | null;
};

const flagLegend = [
  { code: 'S', label: 'Scheduled' },
  { code: 'M', label: 'Manual' },
  { code: 'C', label: 'Continuous' },
  { code: 'K', label: 'Calibration' },
];

const flagColorClass: Record<string, string> = {
  S: 'bg-primary/15 text-primary',
  M: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  C: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  K: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

const DayDetail = ({ day }: DayDetailProps): React.ReactElement => {
  if (!day) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 text-center">
        <Info className="size-4 text-muted-foreground/70" />
        <div className="text-sm font-medium">Select a day</div>
        <div className="max-w-56 text-xs text-muted-foreground">
          Pick a cell on the heatmap to inspect hourly dosing details.
        </div>
      </div>
    );
  }

  const activeHours = getActiveHours(day);
  const dayDate = parseHistoryDate(day.date);
  const totalRuntime = getDayRuntime(day);

  if (activeHours.length === 0) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center">
        <Badge variant="outline">{formatShortDate(dayDate)}</Badge>
        <span className="max-w-56 text-xs text-muted-foreground">
          No dosing activity was recorded for this pump on the selected day.
        </span>
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
          {formatDayVolume(day)}
        </Badge>
        <Badge variant="outline" className="gap-1 tabular-nums">
          <Clock3 className="size-3" />
          {Math.round(totalRuntime / 60)} min
        </Badge>
        <Badge variant="outline" className="tabular-nums">
          {activeHours.length}h active
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/30 bg-background/50 px-2 py-1 text-[10px] text-muted-foreground">
        <span className="mr-0.5 uppercase tracking-wider">Flags</span>
        {flagLegend.map((item) => (
          <span key={item.code} className="inline-flex items-center gap-1">
            <span className={cn('rounded px-1 font-semibold', flagColorClass[item.code])}>
              {item.code}
            </span>
            {item.label}
          </span>
        ))}
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
                      <span className="ml-1 inline-flex gap-px" title={flagTitle(hour.flags)}>
                        {flags.map((flag) => (
                          <span
                            key={flag}
                            className={cn(
                              'rounded px-0.5 text-[9px] font-semibold leading-none',
                              flagColorClass[flag] ?? 'bg-secondary text-foreground/70',
                            )}
                          >
                            {flag}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <span className="font-semibold tabular-nums sm:hidden">{formatCompactHourVolume(hour)}</span>
                    <span className="hidden font-semibold tabular-nums sm:inline">{formatHourVolume(hour)}</span>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-1.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                    {formatStoredHistoryVolume(hour.scheduled_volume_ml)}
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-1.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                    {formatStoredHistoryVolume(hour.manual_volume_ml)}
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
