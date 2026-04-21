import { GpioPull } from '@/lib/api.ts';
import type { BoardConfigState } from '@/lib/api.ts';

export type BoardPreset = {
  id: string;
  name: string;
  description: string;
  config: BoardConfigState;
};

const FYSETC_E4_BASE: Omit<BoardConfigState, 'motors_num'> = {
  uart: 2,
  tx_pin: 22,
  rx_pin: 21,
  channels: [
    { id: 0, dir_pin: 12, en_pin: 25, step_pin: 14, micro_steps: 256 },
    { id: 1, dir_pin: 26, en_pin: 25, step_pin: 27, micro_steps: 256 },
    { id: 2, dir_pin: 17, en_pin: 25, step_pin: 16, micro_steps: 256 },
    { id: 3, dir_pin: 32, en_pin: 25, step_pin: 33, micro_steps: 256 },
  ],
  rtc_i2c_addr: 0x6f,
  eeprom_i2c_addr: 0x50,
  i2c_sda_pin: 21,
  i2c_scl_pin: 22,
  can_tx_pin: -1,
  can_rx_pin: -1,
  adc_channels: [
    { id: 0, pin: 36, enabled: false },
    { id: 1, pin: 39, enabled: false },
  ],
  gpio_inputs: [
    { id: 0, pin: 34, enabled: false, pull: GpioPull.None, active_level: 1 },
    { id: 1, pin: 35, enabled: false, pull: GpioPull.None, active_level: 1 },
    { id: 2, pin: 32, enabled: false, pull: GpioPull.None, active_level: 1 },
  ],
  gpio_outputs: [
    { id: 0, pin: 13, enabled: false, active_level: 1 },
    { id: 1, pin: 2,  enabled: false, active_level: 1 },
    { id: 2, pin: 4,  enabled: false, active_level: 1 },
  ],
};

export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: 'fysetc-e4-v1-4ch',
    name: 'Fysetc E4 v1.0 — 4ch',
    description: 'All 4 channels active. 256 μstep. UART2 TX22/RX21.',
    config: { ...FYSETC_E4_BASE, motors_num: 4 },
  },
  {
    id: 'fysetc-e4-v1-2ch',
    name: 'Fysetc E4 v1.0 — 2ch',
    description: '2 active channels (CH3/CH4 idle). Same wiring.',
    config: { ...FYSETC_E4_BASE, motors_num: 2 },
  },
  {
    id: 'fysetc-e4-v1-1ch',
    name: 'Fysetc E4 v1.0 — 1ch',
    description: 'Single-pump layout. CH1 only.',
    config: { ...FYSETC_E4_BASE, motors_num: 1 },
  },
];
