import React from 'react';
import { CalendarDays, Clock3, Droplets } from 'lucide-react';

import type { PumpHistoryDay } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils.ts';
import {
  formatMonth,
  getDayManualVolume,
  getDayRuntime,
  getDayScheduledVolume,
  getDayVolume,
  getIntensityClass,
  parseHistoryDate,
} from './utils';

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
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
  pumpName: string;
  selectedDay: PumpHistoryDay | null;
  onDaySelect: (stamp: number) => void;
};

const Heatmap = ({ days, pumpName, selectedDay, onDaySelect }: HeatmapProps): React.ReactElement => {
  const { columns, monthLabels } = React.useMemo(() => getHeatmapColumns(days), [days]);

  const maxDayVolume = React.useMemo(
    () => days.reduce((max, day) => Math.max(max, getDayVolume(day)), 0),
    [days]
  );

  const summary = React.useMemo(
    () =>
      days.reduce(
        (acc, day) => {
          const volume = getDayVolume(day);
          return {
            totalVolume: acc.totalVolume + volume,
            activeDays: acc.activeDays + (volume > 0 ? 1 : 0),
          };
        },
        { totalVolume: 0, activeDays: 0 }
      ),
    [days]
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-base font-semibold">{pumpName}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          One cell per day. Intensity reflects total dosed volume.
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <div className="rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
          Volume <span className="ml-1 font-semibold text-foreground">{summary.totalVolume} ml</span>
        </div>
        <div className="rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
          Active <span className="ml-1 font-semibold text-foreground">{summary.activeDays} days</span>
        </div>
      </div>

      <div
        className="grid gap-x-2 gap-y-2"
        style={{ gridTemplateColumns: `32px repeat(${columns.length}, 18px)` }}
      >
        <div />
        <div className="grid gap-2" style={{ gridColumn: `2 / span ${columns.length}` }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, 18px)` }}>
            {monthLabels.map((monthLabel) => (
              <div
                key={monthLabel.key}
                className="text-left text-[10px] text-muted-foreground"
                style={{ gridColumn: `${monthLabel.startColumn + 1} / span ${monthLabel.span}` }}
              >
                {monthLabel.label}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-rows-7 gap-2 pt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {WEEKDAY_LABELS.map((label, index) => (
            <div key={label} className="flex h-[18px] items-center">
              {index === 1 || index === 3 || index === 5 ? label : ''}
            </div>
          ))}
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, 18px)` }}>
          {columns.map((column, columnIndex) =>
            column.days.map((day, rowIndex) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${column.startStamp}-${rowIndex}`}
                    className="size-[18px] rounded-[5px] bg-transparent"
                    style={{ gridColumn: columnIndex + 1, gridRow: rowIndex + 1 }}
                  />
                );
              }

              const totalVolume = getDayVolume(day);
              const selected = day.day_stamp === selectedDay?.day_stamp;
              const dayDate = parseHistoryDate(day.date);

              return (
                <button
                  key={day.day_stamp}
                  type="button"
                  title={`${day.date} · ${totalVolume} ml`}
                  className={cn(
                    'size-[18px] rounded-[5px] border border-black/5 transition hover:scale-110 hover:border-border',
                    getIntensityClass(totalVolume, maxDayVolume),
                    selected && 'ring-2 ring-primary/80 ring-offset-2 ring-offset-background'
                  )}
                  style={{ gridColumn: columnIndex + 1, gridRow: rowIndex + 1 }}
                  onClick={() => onDaySelect(day.day_stamp)}
                >
                  <span className="sr-only">
                    {`${formatMonth(dayDate)} ${dayDate.getDate()} ${totalVolume} ml`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Less</span>
        <span className={cn('size-3 rounded-[3px]', getIntensityClass(0, maxDayVolume))} />
        <span className={cn('size-3 rounded-[3px]', getIntensityClass(maxDayVolume * 0.2, maxDayVolume))} />
        <span className={cn('size-3 rounded-[3px]', getIntensityClass(maxDayVolume * 0.45, maxDayVolume))} />
        <span className={cn('size-3 rounded-[3px]', getIntensityClass(maxDayVolume * 0.7, maxDayVolume))} />
        <span className={cn('size-3 rounded-[3px]', getIntensityClass(maxDayVolume, maxDayVolume))} />
        <span>More</span>
      </div>

      {selectedDay && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedDay.date}</Badge>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Droplets className="size-3.5" />
                Volume
              </span>
              <span className="font-semibold">{getDayVolume(selectedDay)} ml</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock3 className="size-3.5" />
                Runtime
              </span>
              <span className="font-semibold">{Math.round(getDayRuntime(selectedDay) / 60)} min</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="size-3.5" />
                Active
              </span>
              <span className="font-semibold">
                {selectedDay.hours.filter((h) => h.scheduled_volume_ml > 0 || h.manual_volume_ml > 0 || h.total_runtime_s > 0 || h.flags > 0).length} h
              </span>
            </div>
          </div>

          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>Scheduled</span>
              <span className="font-medium text-foreground">{getDayScheduledVolume(selectedDay)} ml</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Manual</span>
              <span className="font-medium text-foreground">{getDayManualVolume(selectedDay)} ml</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Heatmap;
