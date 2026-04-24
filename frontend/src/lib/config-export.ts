import { z } from 'zod';
import {
  BoardConfigState,
  NetworkState,
  PumpAgingState,
  PumpCalibrationState,
  PumpState,
  ScheduleState,
  ServiceState,
  setSettings,
  setBoardConfig,
  SettingsState,
  StatusState,
} from '@/lib/api.ts';

// ─── Version ────────────────────────────────────────────────────────────────

export const CONFIG_EXPORT_VERSION = 1;

// ─── Export types ────────────────────────────────────────────────────────────

/** Pump config fields only — runtime fields (running_hours, tank_current_vol,
 *  tank_concentration_total) are intentionally excluded. */
export type ConfigExportPump = {
  id: number;
  name: string;
  state: boolean;
  direction: boolean;
  aging: PumpAgingState;
  tank_full_vol: number;
  tank_concentration_active: number;
  max_single_run_ml: number;
  max_single_run_seconds: number;
  max_hourly_ml: number;
  max_daily_ml: number;
  schedule: ScheduleState;
  calibration: PumpCalibrationState[];
};

export type ConfigExport = {
  version: number;
  exported_at: string; // ISO 8601
  device_info: {
    firmware_version: string;
    hardware_version: string;
  };
  networks?: NetworkState[];
  services?: ServiceState;
  board?: BoardConfigState;
  pumps?: ConfigExportPump[];
};

export type ImportSection = 'networks' | 'services' | 'board' | 'pumps';

export type ApplyResult = {
  section: ImportSection;
  success: boolean;
  error?: string;
};

// ─── Zod validation schema ───────────────────────────────────────────────────

const networkStateSchema = z
  .object({ id: z.number(), type: z.number(), is_dirty: z.boolean() })
  .passthrough();

const boardConfigChannelSchema = z.object({
  id: z.number(),
  dir_pin: z.number(),
  en_pin: z.number(),
  step_pin: z.number(),
  micro_steps: z.number(),
});

const adcChannelSchema = z.object({
  id: z.number(),
  pin: z.number(),
  enabled: z.boolean(),
});

const gpioInputSchema = z.object({
  id: z.number(),
  pin: z.number(),
  enabled: z.boolean(),
  pull: z.number(),
  active_level: z.number(),
});

const gpioOutputSchema = z.object({
  id: z.number(),
  pin: z.number(),
  enabled: z.boolean(),
  active_level: z.number(),
});

const boardConfigSchema = z.object({
  uart: z.number(),
  tx_pin: z.number(),
  rx_pin: z.number(),
  motors_num: z.number(),
  channels: z.array(boardConfigChannelSchema),
  rtc_i2c_addr: z.number(),
  eeprom_i2c_addr: z.number(),
  i2c_sda_pin: z.number().optional(),
  i2c_scl_pin: z.number().optional(),
  can_tx_pin: z.number(),
  can_rx_pin: z.number(),
  adc_channels: z.array(adcChannelSchema).optional(),
  gpio_inputs: z.array(gpioInputSchema).optional(),
  gpio_outputs: z.array(gpioOutputSchema).optional(),
});

const scheduleStateSchema = z.object({
  mode: z.number(),
  work_hours: z.array(z.number()),
  weekdays: z.array(z.number()),
  speed: z.number(),
  time: z.number(),
  volume: z.number(),
});

const pumpAgingSchema = z.object({
  warning_hours: z.number(),
  replace_hours: z.number(),
});

const calibrationSchema = z.object({
  speed: z.number(),
  flow: z.number(),
});

const exportPumpSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.boolean(),
  direction: z.boolean(),
  aging: pumpAgingSchema,
  tank_full_vol: z.number(),
  tank_concentration_active: z.number(),
  max_single_run_ml: z.number().optional(),
  max_single_run_seconds: z.number().optional(),
  max_hourly_ml: z.number().optional(),
  max_daily_ml: z.number().optional(),
  schedule: scheduleStateSchema,
  calibration: z.array(calibrationSchema),
});

// passthrough() on services so older/newer firmware exports with extra/missing
// fields still validate cleanly.
const serviceStateSchema = z
  .object({
    hostname: z.string(),
    ntp_server: z.string(),
    time_zone: z.string(),
    mqtt_ip_address: z.string(),
    mqtt_port: z.string(),
    mqtt_user: z.string(),
    mqtt_password: z.string(),
    mqtt_qos: z.number(),
    mqtt_retain: z.boolean(),
    enable_ntp: z.boolean(),
    enable_mqtt: z.boolean(),
  })
  .passthrough();

const configExportSchema = z.object({
  version: z.number(),
  exported_at: z.string(),
  device_info: z.object({
    firmware_version: z.string(),
    hardware_version: z.string(),
  }),
  networks: z.array(networkStateSchema).optional(),
  services: serviceStateSchema.optional(),
  board: boardConfigSchema.optional(),
  pumps: z.array(exportPumpSchema).optional(),
});

// ─── Version compatibility ───────────────────────────────────────────────────

export type VersionStatus = 'ok' | 'older' | 'newer';

export function checkVersion(version: number): VersionStatus {
  if (version === CONFIG_EXPORT_VERSION) return 'ok';
  return version < CONFIG_EXPORT_VERSION ? 'older' : 'newer';
}

// ─── Build & download ────────────────────────────────────────────────────────

export function buildExport(
  settings: SettingsState,
  boardConfig: BoardConfigState,
  status: StatusState,
): ConfigExport {
  const pumps: ConfigExportPump[] = settings.pumps.map((pump) => ({
    id: pump.id,
    name: pump.name,
    state: pump.state,
    direction: pump.direction,
    aging: pump.aging,
    tank_full_vol: pump.tank_full_vol,
    tank_concentration_active: pump.tank_concentration_active,
    max_single_run_ml: pump.max_single_run_ml ?? 0,
    max_single_run_seconds: pump.max_single_run_seconds ?? 0,
    max_hourly_ml: pump.max_hourly_ml ?? 0,
    max_daily_ml: pump.max_daily_ml ?? 0,
    schedule: pump.schedule,
    calibration: pump.calibration,
  }));

  return {
    version: CONFIG_EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    device_info: {
      firmware_version: status.firmware_version,
      hardware_version: status.hardware_version,
    },
    networks: settings.networks,
    services: settings.services,
    board: boardConfig,
    pumps,
  };
}

export function downloadExport(data: ConfigExport): void {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `stepper-doser-config-${date}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Parse import file ───────────────────────────────────────────────────────

export function parseImportFile(file: File): Promise<ConfigExport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string) as unknown;
        const result = configExportSchema.safeParse(raw);
        if (!result.success) {
          const first = result.error.issues[0];
          const path = first?.path.join('.') ?? '';
          const msg = first?.message ?? 'Invalid structure';
          reject(new Error(path ? `Invalid field "${path}": ${msg}` : msg));
          return;
        }
        resolve(result.data as ConfigExport);
      } catch {
        reject(new Error('File is not valid JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

// ─── Apply import ────────────────────────────────────────────────────────────

export async function applyImport(
  data: ConfigExport,
  selected: ImportSection[],
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  for (const section of selected) {
    try {
      if (section === 'networks' && data.networks) {
        await setSettings<{ success: boolean }>({ networks: data.networks });
        results.push({ section, success: true });
      } else if (section === 'services' && data.services) {
        await setSettings<{ success: boolean }>({ services: data.services });
        results.push({ section, success: true });
      } else if (section === 'board' && data.board) {
        await setBoardConfig<{ success: boolean }>(data.board);
        results.push({ section, success: true });
      } else if (section === 'pumps' && data.pumps) {
        // Runtime fields (running_hours, tank_current_vol, tank_concentration_total)
        // are absent from the export intentionally. The firmware merges by id and
        // preserves any fields not present in the payload.
        await setSettings<{ success: boolean }>({
          pumps: data.pumps as unknown as PumpState[],
        });
        results.push({ section, success: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ section, success: false, error: message });
    }
  }

  return results;
}
