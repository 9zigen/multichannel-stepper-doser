import { GpioPull } from '@/lib/api.ts';
import type { BoardConfigChannel, BoardConfigState } from '@/lib/api.ts';

export const MICROSTEP_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
export const MAX_BOARD_CHANNELS = 4;
export const BASE_MAX_RPM_AT_256 = 30;

// Fysetc E4 v1.0 — verified from firmware app_settings.c defaults
const FYSETC_E4_CHANNELS: BoardConfigChannel[] = [
  { id: 0, dir_pin: 12, en_pin: 25, step_pin: 14, micro_steps: 256 },
  { id: 1, dir_pin: 26, en_pin: 25, step_pin: 27, micro_steps: 256 },
  { id: 2, dir_pin: 17, en_pin: 25, step_pin: 16, micro_steps: 256 },
  { id: 3, dir_pin: 32, en_pin: 25, step_pin: 33, micro_steps: 256 },
];

export function createEmptyBoardConfig(): BoardConfigState {
  return {
    uart: 2,
    tx_pin: 22,
    rx_pin: 21,
    motors_num: 4,
    channels: FYSETC_E4_CHANNELS.map((ch) => ({ ...ch })),
    rtc_i2c_addr: 0x6f,    // MCP7940
    eeprom_i2c_addr: 0x50, // 24LC series
    i2c_sda_pin: 21,
    i2c_scl_pin: 22,
    can_tx_pin: -1,
    can_rx_pin: -1,
    // Fysetc E4 v1.0 ADC inputs: ADC1_CH0 = GPIO36, ADC1_CH3 = GPIO39
    adc_channels: [
      { id: 0, pin: 36, enabled: false },
      { id: 1, pin: 39, enabled: false },
    ],
    // Fysetc E4 v1.0 digital inputs
    gpio_inputs: [
      { id: 0, pin: 34, enabled: false, pull: GpioPull.None, active_level: 1 },
      { id: 1, pin: 35, enabled: false, pull: GpioPull.None, active_level: 1 },
      { id: 2, pin: 32, enabled: false, pull: GpioPull.None, active_level: 1 },
    ],
    // Fysetc E4 v1.0 digital outputs
    gpio_outputs: [
      { id: 0, pin: 13, enabled: false, active_level: 1 },
      { id: 1, pin: 2,  enabled: false, active_level: 1 },
      { id: 2, pin: 4,  enabled: false, active_level: 1 },
    ],
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

/** Parses a hex (0x6F) or decimal (111) string to a number. Returns 0 on failure. */
export function parseI2cInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const parsed = trimmed.toLowerCase().startsWith('0x')
    ? parseInt(trimmed, 16)
    : parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Formats a number as uppercase hex string with 0x prefix, e.g. 0x6F */
export function formatI2cAddr(value: number): string {
  if (value <= 0) return '0x00';
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}
