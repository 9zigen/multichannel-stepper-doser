import React from 'react';
import { Waves } from 'lucide-react';

import type { PumpHistoryDay } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  formatHourLabel,
  formatRuntime,
  formatShortDate,
  getActiveHours,
  parseHistoryDate,
  renderFlags,
} from './utils';

type DayDetailProps = {
  day: PumpHistoryDay | null;
};

const DayDetail = ({ day }: DayDetailProps): React.ReactElement => {
  if (!day) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a day on the heatmap to see hourly breakdown.
      </div>
    );
  }

  const activeHours = getActiveHours(day);

  if (activeHours.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          No dosing activity recorded on {formatShortDate(parseHistoryDate(day.date))}. All 24 hours were idle.
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <th className="sticky top-0 whitespace-nowrap bg-card/95 py-2 pr-4 text-left font-medium">Hour</th>
            <th className="sticky top-0 whitespace-nowrap bg-card/95 py-2 px-4 text-right font-medium">Total</th>
            <th className="sticky top-0 whitespace-nowrap bg-card/95 py-2 px-4 text-right font-medium">Scheduled</th>
            <th className="sticky top-0 whitespace-nowrap bg-card/95 py-2 px-4 text-right font-medium">Manual</th>
            <th className="sticky top-0 whitespace-nowrap bg-card/95 py-2 px-4 text-right font-medium">Runtime</th>
            <th className="sticky top-0 whitespace-nowrap bg-card/95 py-2 pl-4 text-left font-medium">Trigger</th>
          </tr>
        </thead>
        <tbody>
          {activeHours.map((hour) => {
            const totalVolume = hour.scheduled_volume_ml + hour.manual_volume_ml;
            const flags = renderFlags(hour.flags);

            return (
              <tr key={hour.hour} className="border-b border-border/50 last:border-0">
                <td className="whitespace-nowrap py-2 pr-4 font-medium">{formatHourLabel(hour.hour)}</td>
                <td className="whitespace-nowrap py-2 px-4 text-right">
                  <Badge variant="secondary" className="font-semibold">{totalVolume} ml</Badge>
                </td>
                <td className="whitespace-nowrap py-2 px-4 text-right text-muted-foreground">{hour.scheduled_volume_ml} ml</td>
                <td className="whitespace-nowrap py-2 px-4 text-right text-muted-foreground">{hour.manual_volume_ml} ml</td>
                <td className="whitespace-nowrap py-2 px-4 text-right text-muted-foreground">{formatRuntime(hour.total_runtime_s)}</td>
                <td className="whitespace-nowrap py-2 pl-4">
                  <div className="flex flex-wrap gap-1">
                    {flags.map((flag) => (
                      <Badge key={`${hour.hour}-${flag}`} variant="outline" className="text-xs">
                        <Waves className="mr-1 size-3" />
                        {flag}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

export default DayDetail;
