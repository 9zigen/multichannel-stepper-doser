import type { BoardConfigChannel, BoardConfigState } from '@/lib/api.ts';

export const MICROSTEP_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
export const MAX_BOARD_CHANNELS = 4;
export const BASE_MAX_RPM_AT_256 = 30;

export function createEmptyBoardConfig(): BoardConfigState {
  return {
    uart: 2,
    tx_pin: 22,
    rx_pin: 21,
    motors_num: 4,
    channels: Array.from({ length: MAX_BOARD_CHANNELS }, (_, id) => ({
      id,
      dir_pin: 0,
      en_pin: 0,
      step_pin: 0,
      micro_steps: 256,
    })),
  };
}

export function getMaxRpmForMicrosteps(microSteps: number): number {
  if (!Number.isFinite(microSteps) || microSteps <= 0) {
    return BASE_MAX_RPM_AT_256;
  }

  return BASE_MAX_RPM_AT_256 * (256 / microSteps);
}

export function getChannelMaxRpm(channel: BoardConfigChannel | undefined): number {
  return getMaxRpmForMicrosteps(channel?.micro_steps ?? 256);
}

export function getChannelConfig(boardConfig: BoardConfigState | null, pumpId: number | undefined): BoardConfigChannel | null {
  if (!boardConfig || pumpId === undefined) {
    return null;
  }

  return boardConfig.channels.find((channel) => channel.id === pumpId) ?? null;
}

export function formatRemainingDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`;
}
