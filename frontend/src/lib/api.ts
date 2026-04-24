import { http } from './http';
import { AxiosProgressEvent } from 'axios';

export type UserCredentials = {
  username: string;
  password: string;
};

export type CheckCredentialsState = {
  token: string;
};

export const checkCredentials = async <T>(user: UserCredentials): Promise<T> => {
  const data = await http.post('/api/auth', { username: user.username, password: user.password });
  return data.data as T;
};

export const getUser = async <T>(): Promise<T> => {
  const data = await http.get('/api/settings');
  return data.data as T;
};

export const setUser = async <T>(user: UserCredentials): Promise<T> => {
  const data = await http.post('/api/settings', { auth: user });
  return data.data as T;
};

export type AuthState = {
  username: string;
  password: string;
};

export enum NetworkType {
  WiFi = 0,
  Ethernet = 1,
  BLE = 2,
  Thread = 3,
  CAN = 4,
}

export interface NetworkStateBase {
  id: number;
  type: NetworkType;
  is_dirty: boolean;
}

export interface NetworkStateBaseEthernet extends NetworkStateBase {
  ip_address: string;
  mask: string;
  gateway: string;
  dns: string;
  dhcp: boolean;
}

export interface NetworkStateEthernet extends NetworkStateBaseEthernet {
  vlan_tag?: number;
  type: NetworkType.Ethernet;
}

export interface NetworkStateWifi extends NetworkStateBaseEthernet {
  ssid: string;
  password: string;
  keep_ap_active: boolean;
  type: NetworkType.WiFi;
}

export interface NetworkStateBle extends NetworkStateBase {
  type: NetworkType.BLE;
}

export interface NetworkStateThread extends NetworkStateBase {
  channel: number;
  network_name: string;
  network_key: string;
  pan_id: string;
  ext_pan_id: string;
  pskc: string;
  mesh_local_prefix: string;
  force_dataset: boolean;
  type: NetworkType.Thread;
}

export type NetworkState = NetworkStateEthernet | NetworkStateWifi | NetworkStateBle | NetworkStateThread;

export type PumpCalibrationState = {
  speed: number;
  flow: number;
};

export type PumpAgingState = {
  warning_hours: number;
  replace_hours: number;
};

export type PumpDriverState = {
  uart_ready: boolean;
  reset: boolean;
  driver_error: boolean;
  undervoltage: boolean;
  otpw: boolean;
  ot: boolean;
  s2ga: boolean;
  s2gb: boolean;
  s2vsa: boolean;
  s2vsb: boolean;
  ola: boolean;
  olb: boolean;
  thermal_level: number;
  cs_actual: number;
  stealth: boolean;
  standstill: boolean;
  version: number;
};

export enum SCHEDULE_MODE {
  OFF = 0,
  PERIODIC = 1,
  CONTINUOUS = 2,
}

export type ScheduleState = {
  mode: SCHEDULE_MODE;
  work_hours: number[];
  weekdays: number[];
  speed: number;
  time: number;
  volume: number;
};
export type PumpState = {
  id: number;
  state: boolean;
  name: string;
  direction: boolean;
  running_hours: number;
  aging: PumpAgingState;
  tank_full_vol: number;
  tank_current_vol: number;
  tank_concentration_total: number /* runtime data */;
  tank_concentration_active: number;
  max_single_run_ml?: number;
  max_single_run_seconds?: number;
  max_hourly_ml?: number;
  max_daily_ml?: number;
  schedule: ScheduleState;
  calibration: PumpCalibrationState[];
};

export type AppState = {
  onboarding_completed: boolean;
};

export type ServiceState = {
  hostname: string;
  ntp_server: string;
  time_zone: string;
  mqtt_ip_address: string;
  mqtt_port: string;
  mqtt_user: string;
  mqtt_password: string;
  mqtt_qos: number;
  mqtt_retain: boolean;
  mqtt_discovery_topic: string;
  mqtt_discovery_status_topic: string;
  max_total_daily_ml?: number;
  enable_ntp: boolean;
  enable_mqtt: boolean;
  enable_mqtt_discovery: boolean;
  ota_url: string;
};

export type TimeState = {
  time_zone: string;
  date: string;
  time: string;
};

export type SettingsState = {
  auth: AuthState;
  app: AppState;
  networks: NetworkState[];
  services: ServiceState;
  pumps: PumpState[];
  time: TimeState;
};

export type StatusState = {
  up_time: string;
  local_time: string;
  local_date: string;
  time_valid: boolean;
  time_warning: string;
  free_heap: number;
  vcc: number;
  board_temperature: number;
  wifi_mode: 'STA' | 'AP' | 'AP+STA';
  ip_address: string;
  mac_address: string;
  station_connected: boolean;
  station_ssid: string;
  station_ip_address: string;
  station_mac_address: string;
  ap_ssid: string;
  ap_ip_address: string;
  ap_mac_address: string;
  ap_clients: number;
  mqtt_service: { enabled: boolean; connected: boolean };
  ntp_service: { enabled: boolean; sync: boolean };
  firmware_version: string;
  firmware_date: string;
  hardware_version: string;
  wifi_disconnects: number;
  reboot_count: number;
  last_reboot_reason: string;
  storage_backend: string;
  rtc_backend: string;
};

export type StatusPatch = Partial<
  Pick<
    StatusState,
    | 'up_time'
    | 'local_time'
    | 'local_date'
    | 'free_heap'
    | 'vcc'
    | 'wifi_mode'
    | 'ip_address'
    | 'station_connected'
    | 'station_ssid'
    | 'station_ip_address'
    | 'ap_ssid'
    | 'ap_ip_address'
    | 'ap_clients'
    | 'board_temperature'
    | 'wifi_disconnects'
    | 'time_valid'
    | 'time_warning'
    | 'mqtt_service'
    | 'ntp_service'
  >
>;

export type WifiScanNetwork = {
  ssid: string;
  rssi: number;
  secure: boolean;
  channel: number;
};

export type PumpRunState = {
  id: number;
  speed: number;
  direction: boolean;
  time?: number;
  time_seconds?: number;
};

export type PumpRuntimeMode = 'off' | 'timed' | 'continuous' | 'calibration';

export type PumpRuntimeEntry = {
  id: number;
  active: boolean;
  state: PumpRuntimeMode;
  speed: number;
  direction: boolean;
  remaining_ticks: number;
  remaining_seconds: number;
  volume_ml: number;
  alert_flags?: number;
  driver?: PumpDriverState;
};

export type PumpHistoryHour = {
  hour: number;
  scheduled_volume_ml: number;
  manual_volume_ml: number;
  total_runtime_s: number;
  flags: number;
};

export type PumpHistoryDay = {
  day_stamp: number;
  date: string;
  hours: PumpHistoryHour[];
};

export type PumpHistoryPump = {
  id: number;
  name: string;
  days: PumpHistoryDay[];
};

export type PumpHistoryState = {
  retention_days: number;
  current_day_stamp: number;
  pumps: PumpHistoryPump[];
};

export type SettingsSaveResponse = SettingsState;

export type BoardConfigChannel = {
  id: number;
  dir_pin: number;
  en_pin: number;
  step_pin: number;
  micro_steps: number;
};

export enum GpioPull {
  None = 0,
  Up = 1,
  Down = 2,
}

export type AdcChannelConfig = {
  id: number;
  pin: number;
  enabled: boolean;
};

export type GpioInputConfig = {
  id: number;
  pin: number;
  enabled: boolean;
  pull: GpioPull;
  active_level: number; // 0 = active-low, 1 = active-high
};

export type GpioOutputConfig = {
  id: number;
  pin: number;
  enabled: boolean;
  active_level: number; // 0 = active-low, 1 = active-high
};

export type BoardConfigState = {
  uart: number;
  tx_pin: number;
  rx_pin: number;
  motors_num: number;
  channels: BoardConfigChannel[];
  rtc_i2c_addr: number;    // 7-bit I2C address; 0 = not present
  eeprom_i2c_addr: number; // 7-bit I2C address; 0 = not present
  i2c_sda_pin: number;
  i2c_scl_pin: number;
  can_tx_pin: number;      // -1 = disabled
  can_rx_pin: number;      // -1 = disabled
  adc_channels: AdcChannelConfig[];
  gpio_inputs: GpioInputConfig[];
  gpio_outputs: GpioOutputConfig[];
};

/** Firmware returns the full saved config on POST /api/board-config */
export type BoardConfigSaveResponse = BoardConfigState;

export type CalibrationResponse = {
  success: boolean;
};

export type PumpRunResponse = {
  success: boolean;
};

export type DeviceActionResponse = {
  success: boolean;
  message?: string;
};

export const getStatus = async <T>(): Promise<T> => {
  const data = await http.get('/api/status');
  return data?.data?.status as T;
};

export const getSettings = async <T>(): Promise<T> => {
  const data = await http.get('/api/settings');
  return data.data as T;
};

export const setSettings = async <T>(payload: Partial<SettingsState>): Promise<T> => {
  const data = await http.post('/api/settings', payload);
  return data.data as T;
};

export const getBoardConfig = async <T>(): Promise<T> => {
  const data = await http.get('/api/board-config');
  return data.data as T;
};

export const getPumpsHistory = async <T>(): Promise<T> => {
  const data = await http.get('/api/pumps/history');
  return data.data as T;
};

export const setBoardConfig = async <T>(payload: BoardConfigState): Promise<T> => {
  const data = await http.post('/api/board-config', payload);
  return data.data as T;
};

export const runCalibration = async <T>(payload: PumpRunState): Promise<T> => {
  const data = await http.post('/api/calibration', payload);
  return data.data as T;
};

export const runPump = async <T>(payload: PumpRunState): Promise<T> => {
  const data = await http.post('/api/run', payload);
  return data.data as T;
};

export const getPumpsRuntime = async <T>(): Promise<T> => {
  const data = await http.get('/api/pumps/runtime');
  return data.data as T;
};

export const uploadFirmware = async <T>(
  file: File,
  onUploadProgress: (event: AxiosProgressEvent) => void
): Promise<T> => {
  const formData = new FormData();
  formData.append('file', file);
  const data = await http.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });
  return data.data as T;
};

export const restartDevice = async <T>(): Promise<T> => {
  const data = await http.post('/api/device/restart');
  return data.data as T;
};

export const factoryResetDevice = async <T>(): Promise<T> => {
  const data = await http.post('/api/device/factory-reset');
  return data.data as T;
};

export const scanWifiNetworks = async <T>(): Promise<T> => {
  const data = await http.get('/api/network/wifi/scan');
  return data.data as T;
};
