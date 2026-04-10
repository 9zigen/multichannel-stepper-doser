import { CalendarClock, Clock3, type LucideIcon, Waves } from 'lucide-react';

import { PumpState, SCHEDULE_MODE } from '@/lib/api';

type ScheduleModeMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
  badgeVariant: 'default' | 'secondary' | 'outline';
};

const formatScheduleNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export const scheduleModeMeta: Record<SCHEDULE_MODE, ScheduleModeMeta> = {
  [SCHEDULE_MODE.OFF]: {
    label: 'Off',
    description: 'Disable all automatic dosing for this pump.',
    icon: Clock3,
    badgeVariant: 'outline',
  },
  [SCHEDULE_MODE.PERIODIC]: {
    label: 'Periodic',
    description: 'Dose on selected weekdays and hours using a daily target volume.',
    icon: CalendarClock,
    badgeVariant: 'secondary',
  },
  [SCHEDULE_MODE.CONTINUOUS]: {
    label: 'Continuous',
    description: 'Run at a constant speed until you switch the schedule mode.',
    icon: Waves,
    badgeVariant: 'default',
  },
};

export const formatVolumePerDay = (value: number) => `${formatScheduleNumber(value)} ml/day`;

export const formatRpm = (value: number) => `${formatScheduleNumber(value)} rpm`;

export const formatDaysCount = (value: number[]) => `${value.length} ${value.length === 1 ? 'day' : 'days'}`;

export const formatHoursCount = (value: number[]) => `${value.length} ${value.length === 1 ? 'hour' : 'hours'}`;

export const getPumpScheduleHeadline = (pump: PumpState) => {
  switch (pump.schedule.mode) {
    case SCHEDULE_MODE.PERIODIC:
      return formatVolumePerDay(pump.schedule.volume);
    case SCHEDULE_MODE.CONTINUOUS:
      return formatRpm(pump.schedule.speed);
    case SCHEDULE_MODE.OFF:
    default:
      return 'Automation off';
  }
};

export const getPumpScheduleDetails = (pump: PumpState) => {
  switch (pump.schedule.mode) {
    case SCHEDULE_MODE.PERIODIC:
      return [formatRpm(pump.schedule.speed), formatDaysCount(pump.schedule.weekdays), formatHoursCount(pump.schedule.work_hours)];
    case SCHEDULE_MODE.CONTINUOUS:
      return [pump.state ? 'Currently running' : 'Ready to run', 'No timing windows'];
    case SCHEDULE_MODE.OFF:
    default:
      return ['Manual control only'];
  }
};
