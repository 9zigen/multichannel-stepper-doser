import type { PumpHistoryDay, PumpHistoryHour } from '@/lib/api.ts';

export const FLAG_SCHEDULED = 1;
export const FLAG_MANUAL = 2;
export const FLAG_CONTINUOUS = 4;
export const FLAG_CALIBRATION = 8;

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short' });
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const VOLUME_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const COMPACT_VOLUME_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const HISTORY_HOUR_VOLUME_MAX_ML = 6553.5;

export const formatMonth = (date: Date) => MONTH_FORMATTER.format(date);
export const formatShortDate = (date: Date) => DATE_FORMATTER.format(date);

export const formatHourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export const isSaturatedHistoryVolume = (volume: number) => volume >= HISTORY_HOUR_VOLUME_MAX_ML;

export const isSaturatedHourVolume = (hour: PumpHistoryHour) =>
  isSaturatedHistoryVolume(hour.scheduled_volume_ml) || isSaturatedHistoryVolume(hour.manual_volume_ml);

export const isSaturatedDayVolume = (day: PumpHistoryDay) => day.hours.some(isSaturatedHourVolume);

export const formatHistoryVolume = (volume: number, saturated = false) => {
  if (saturated) {
    return '> 6.5L';
  }

  if (volume >= 1000) {
    return `${VOLUME_FORMATTER.format(volume / 1000)} L`;
  }

  return `${VOLUME_FORMATTER.format(volume)} ml`;
};

export const formatStoredHistoryVolume = (volume: number) =>
  formatHistoryVolume(volume, isSaturatedHistoryVolume(volume));

export const formatCompactHistoryVolume = (volume: number, saturated = false) => {
  if (saturated) {
    return '>6.5L';
  }

  if (!Number.isFinite(volume) || volume <= 0) {
    return '0ml';
  }

  if (volume < 0.01) {
    return '<0.01ml';
  }

  if (volume <= 999) {
    return `${COMPACT_VOLUME_FORMATTER.format(volume)}ml`;
  }

  const liters = volume / 1000;
  if (liters > 999) {
    return '>999L';
  }

  return `${COMPACT_VOLUME_FORMATTER.format(liters)}L`;
};

export const formatCompactHourVolume = (hour: PumpHistoryHour) =>
  formatCompactHistoryVolume(getHourVolume(hour), isSaturatedHourVolume(hour));

export const formatRuntime = (seconds: number) => {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes} min ${remainder} s` : `${minutes} min`;
};

export const parseHistoryDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const getHourVolume = (hour: PumpHistoryHour) =>
  hour.scheduled_volume_ml + hour.manual_volume_ml;

export const formatHourVolume = (hour: PumpHistoryHour) =>
  formatHistoryVolume(getHourVolume(hour), isSaturatedHourVolume(hour));

export const getDayVolume = (day: PumpHistoryDay) =>
  day.hours.reduce((sum, hour) => sum + getHourVolume(hour), 0);

export const formatDayVolume = (day: PumpHistoryDay) =>
  formatHistoryVolume(getDayVolume(day), isSaturatedDayVolume(day));

export const getDayRuntime = (day: PumpHistoryDay) =>
  day.hours.reduce((sum, hour) => sum + hour.total_runtime_s, 0);

export const getDayScheduledVolume = (day: PumpHistoryDay) =>
  day.hours.reduce((sum, hour) => sum + hour.scheduled_volume_ml, 0);

export const getDayManualVolume = (day: PumpHistoryDay) =>
  day.hours.reduce((sum, hour) => sum + hour.manual_volume_ml, 0);

export const getActiveHours = (day: PumpHistoryDay) =>
  day.hours.filter(
    (hour) => hour.scheduled_volume_ml > 0 || hour.manual_volume_ml > 0 || hour.total_runtime_s > 0 || hour.flags > 0
  );

export const getIntensityClass = (value: number, maxValue: number) => {
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

export const getBarIntensityClass = (value: number, maxValue: number) => {
  if (value <= 0 || maxValue <= 0) {
    return 'bg-muted/30';
  }

  const ratio = value / maxValue;

  if (ratio >= 0.85) {
    return 'bg-emerald-500/40';
  }
  if (ratio >= 0.55) {
    return 'bg-emerald-400/35';
  }
  if (ratio >= 0.3) {
    return 'bg-emerald-300/30';
  }
  return 'bg-emerald-200/25';
};

export const renderFlags = (flags: number): string[] => {
  const items: string[] = [];

  if (flags & FLAG_SCHEDULED) {
    items.push('S');
  }
  if (flags & FLAG_MANUAL) {
    items.push('M');
  }
  if (flags & FLAG_CONTINUOUS) {
    items.push('C');
  }
  if (flags & FLAG_CALIBRATION) {
    items.push('K');
  }

  return items;
};

export const flagTitle = (flags: number): string => {
  const names: string[] = [];
  if (flags & FLAG_SCHEDULED) names.push('Scheduled');
  if (flags & FLAG_MANUAL) names.push('Manual');
  if (flags & FLAG_CONTINUOUS) names.push('Continuous');
  if (flags & FLAG_CALIBRATION) names.push('Calibration');
  return names.join(', ');
};

export const getTodayStamp = () => Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);
