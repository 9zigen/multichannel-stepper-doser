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
export type NetworkState = {
  id: number;
  ssid: string;
  password: string;
  ip_address: string;
  mask: string;
  gateway: string;
  dns: string;
  dhcp: boolean;
  type: NetworkType;
};

export type PumpCalibrationState = {
  speed: number;
  flow: number;
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
  tank_full_vol: number;
  tank_current_vol: number;
  tank_concentration_total: number /* runtime data */;
  tank_concentration_active: number;
  schedule: ScheduleState;
  calibration: PumpCalibrationState[];
};

export type ServiceState = {
  hostname: string;
  ntp_server: string;
  utc_offset: number;
  ntp_dst: boolean;
  mqtt_ip_address: string;
  mqtt_port: string;
  mqtt_user: string;
  mqtt_password: string;
  mqtt_qos: number;
  enable_ntp: boolean;
  enable_mqtt: boolean;
  ota_url: string;
};

export type TimeState = {
  time_zone: string;
  date: string;
  time: string;
};

export type SettingsState = {
  auth: AuthState;
  networks: NetworkState[];
  services: ServiceState;
  pumps: PumpState[];
  time: TimeState;
};

export type StatusState = {
  up_time: string;
  local_time: string;
  free_heap: number;
  vcc: number;
  board_temperature: number;
  wifi_mode: 'STA' | 'AP';
  ip_address: string;
  mac_address: string;
  mqtt_service: { enabled: boolean; connected: boolean };
  ntp_service: { enabled: boolean; sync: boolean };
  firmware_version: string;
  firmware_date: string;
};

export type PumpRunState = {
  id: number;
  speed: number;
  direction: boolean;
  time: number;
};

export type SettingsSaveResponse = {
  success: boolean;
};

export type CalibrationResponse = {
  success: boolean;
};

export type PumpRunResponse = {
  success: boolean;
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

export const runCalibration = async <T>(payload: PumpRunState): Promise<T> => {
  const data = await http.post('/api/calibration', payload);
  return data.data as T;
};

export const runPump = async <T>(payload: PumpRunState): Promise<T> => {
  const data = await http.post('/api/run', payload);
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
