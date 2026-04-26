import React from 'react';

import type { PumpHistoryDay } from '@/lib/api.ts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils.ts';
import {
  formatCompactHistoryVolume,
  formatDayVolume,
  getBarIntensityClass,
  getDayVolume,
  getIntensityClass,
  isSaturatedDayVolume,
  parseHistoryDate,
} from './utils';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short' });

type HeatmapColumn = {
  days: Array<PumpHistoryDay | null>;
  startStamp: number;
};

type HeatmapMonthLabel = {
  key: string;
  label: string;
  startColumn: number;
  span: number;
};

const getHeatmapColumns = (days: PumpHistoryDay[]) => {
  if (days.length === 0) {
    return { columns: [] as HeatmapColumn[], monthLabels: [] as HeatmapMonthLabel[] };
  }

  const dayMap = new Map(days.map((day) => [day.day_stamp, day]));
  const firstDate = parseHistoryDate(days[0].date);
  const lastDate = parseHistoryDate(days[days.length - 1].date);
  const startStamp = days[0].day_stamp - firstDate.getDay();
  const endStamp = days[days.length - 1].day_stamp + (6 - lastDate.getDay());
  const columns: HeatmapColumn[] = [];

  for (let stamp = startStamp; stamp <= endStamp; stamp += 7) {
    const columnDays = Array.from({ length: 7 }, (_, weekdayIndex) => dayMap.get(stamp + weekdayIndex) ?? null);
    columns.push({ days: columnDays, startStamp: stamp });
  }

  const monthLabels: HeatmapMonthLabel[] = [];
  let currentMonthKey: string | null = null;
  let currentLabel: HeatmapMonthLabel | null = null;

  columns.forEach((column, columnIndex) => {
    const columnDate = new Date(column.startStamp * 86400000);
    const labelKey = `${columnDate.getFullYear()}-${columnDate.getMonth()}`;

    if (labelKey !== currentMonthKey) {
      currentMonthKey = labelKey;
      currentLabel = {
        key: labelKey,
        label: MONTH_FORMATTER.format(columnDate),
        startColumn: columnIndex,
        span: 1,
      };
      monthLabels.push(currentLabel);
      return;
    }

    if (currentLabel) {
      currentLabel.span += 1;
    }
  });

  return { columns, monthLabels };
};

type HeatmapProps = {
  days: PumpHistoryDay[];
  selectedDay: PumpHistoryDay | null;
  onDaySelect: (stamp: number) => void;
};

const Heatmap = ({ days, selectedDay, onDaySelect }: HeatmapProps): React.ReactElement => {
  const { columns, monthLabels } = React.useMemo(() => getHeatmapColumns(days), [days]);

  const maxDayVolume = React.useMemo(
    () => days.reduce((max, day) => Math.max(max, getDayVolume(day)), 0),
    [days],
  );

  const recentDays = React.useMemo(() => days.slice(-30), [days]);

  return (
    <div className="flex flex-col gap-2">
      {/* Heatmap + Daily volume bar chart — stacked on mobile, row on sm+ */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Heatmap grid (fixed width) */}
        <ScrollArea className="shrink-0">
          <div
            className="grid gap-x-1 gap-y-1"
            style={{ gridTemplateColumns: `20px repeat(${columns.length}, 14px)` }}
          >
            {/* Month labels row */}
            <div />
            <div className="grid gap-1" style={{ gridColumn: `2 / span ${columns.length}` }}>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns.length}, 14px)` }}>
                {monthLabels.map((monthLabel) => (
                  <div
                    key={monthLabel.key}
                    className="text-left text-[9px] text-muted-foreground"
                    style={{ gridColumn: `${monthLabel.startColumn + 1} / span ${monthLabel.span}` }}
                  >
                    {monthLabel.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-rows-7 gap-1 text-[9px] text-muted-foreground">
              {WEEKDAY_LABELS.map((label, index) => (
                <div key={`${label}-${index}`} className="flex h-[14px] items-center justify-end pr-0.5">
                  {index % 2 === 1 ? label : ''}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns.length}, 14px)` }}>
              {columns.map((column, columnIndex) =>
                column.days.map((day, rowIndex) => {
                  if (!day) {
                    return (
                      <div
                        key={`empty-${column.startStamp}-${rowIndex}`}
                        className="size-[14px] rounded-[3px] bg-transparent"
                        style={{ gridColumn: columnIndex + 1, gridRow: rowIndex + 1 }}
                      />
                    );
                  }

                  const totalVolume = getDayVolume(day);
                  const selected = day.day_stamp === selectedDay?.day_stamp;

                  return (
                    <button
                      key={day.day_stamp}
                      type="button"
                      title={`${day.date} · ${formatDayVolume(day)}`}
                      className={cn(
                        'size-[14px] rounded-[3px] border border-black/5 transition hover:scale-110 hover:border-border',
                        getIntensityClass(totalVolume, maxDayVolume),
                        selected && 'ring-1.5 ring-primary/80 ring-offset-1 ring-offset-background',
                      )}
                      style={{ gridColumn: columnIndex + 1, gridRow: rowIndex + 1 }}
                      onClick={() => onDaySelect(day.day_stamp)}
                    />
                  );
                }),
              )}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Daily volume bar chart (fills remaining width on sm+, fixed height on mobile) */}
        {recentDays.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Daily volume</span>
            <div className="flex h-10 items-end gap-px sm:h-auto sm:flex-1">
              {recentDays.map((day, i) => {
                const vol = getDayVolume(day);
                const pct = maxDayVolume > 0 ? Math.max(vol / maxDayVolume, 0.04) : 0.04;
                const selected = day.day_stamp === selectedDay?.day_stamp;
                const saturated = isSaturatedDayVolume(day);
                return (
                  <button
                    key={day.day_stamp}
                    type="button"
                    title={`${day.date} · ${formatDayVolume(day)}`}
                    className={cn(
                      'flex-1 origin-bottom rounded-t-sm animate-bar-rise transition-colors hover:opacity-80',
                      selected
                        ? getIntensityClass(vol, maxDayVolume)
                        : getBarIntensityClass(vol, maxDayVolume),
                    )}
                    style={{ height: `${pct * 100}%`, animationDelay: `${i * 15}ms` }}
                    onClick={() => onDaySelect(day.day_stamp)}
                  >
                    {selected && (
                      <span className="sr-only">
                        {day.date} {formatCompactHistoryVolume(vol, saturated)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <span>Less</span>
        <span className={cn('size-2.5 rounded-[2px]', getIntensityClass(0, maxDayVolume))} />
        <span className={cn('size-2.5 rounded-[2px]', getIntensityClass(maxDayVolume * 0.2, maxDayVolume))} />
        <span className={cn('size-2.5 rounded-[2px]', getIntensityClass(maxDayVolume * 0.45, maxDayVolume))} />
        <span className={cn('size-2.5 rounded-[2px]', getIntensityClass(maxDayVolume * 0.7, maxDayVolume))} />
        <span className={cn('size-2.5 rounded-[2px]', getIntensityClass(maxDayVolume, maxDayVolume))} />
        <span>More</span>
      </div>
    </div>
  );
};

export default Heatmap;
