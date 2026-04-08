import type {
  AxiosAdapter,
  AxiosProgressEvent,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

import type {
  AuthState,
  BoardConfigState,
  NetworkState,
  PumpRuntimeEntry,
  PumpRunState,
  PumpState,
  ServiceState,
  SettingsState,
  StatusState,
  TimeState,
  WifiScanNetwork,
} from '@/lib/api.ts';
import { emitMockRealtimeMessage } from '@/lib/realtime-mock.ts';

type MockState = {
  auth: AuthState;
  boardConfig: BoardConfigState;
  networks: NetworkState[];
  pumps: PumpState[];
  services: ServiceState;
  status: StatusState;
  time: TimeState;
};

type MockPumpRuntimeState = {
  state: PumpRuntimeEntry['state'];
  speed: number;
  direction: boolean;
  started_at: number;
  ends_at: number | null;
  duration_seconds: number;
};

const SCHEDULE_MODE = {
  OFF: 0,
  PERIODIC: 1,
  CONTINUOUS: 2,
} as const;

const mockWifiNetworks: WifiScanNetwork[] = [
  { ssid: 'ReefLab-5G', rssi: -42, secure: true, channel: 36 },
  { ssid: 'Workshop-IoT', rssi: -58, secure: true, channel: 11 },
  { ssid: 'Guest-WiFi', rssi: -67, secure: false, channel: 6 },
  { ssid: 'FragRoom', rssi: -74, secure: true, channel: 1 },
];

const initialState: MockState = {
  services: {
    hostname: 'test',
    ntp_server: '',
    time_zone: 'Europe/Madrid',
    mqtt_ip_address: '192.168.1.100',
    mqtt_port: '',
    mqtt_user: '',
    mqtt_password: '',
    mqtt_qos: 0,
    enable_ntp: false,
    enable_mqtt: false,
    ota_url: 'http://192.168.4.2:8080/hv_cc_led_driver_rtos.ota.bin',
  },
  auth: {
    username: 'admin',
    password: 'admin',
  },
  boardConfig: {
    uart: 2,
    tx_pin: 22,
    rx_pin: 21,
    motors_num: 4,
    channels: [
      { id: 0, dir_pin: 12, en_pin: 25, step_pin: 14, micro_steps: 256 },
      { id: 1, dir_pin: 26, en_pin: 25, step_pin: 27, micro_steps: 256 },
      { id: 2, dir_pin: 17, en_pin: 25, step_pin: 16, micro_steps: 256 },
      { id: 3, dir_pin: 32, en_pin: 25, step_pin: 33, micro_steps: 256 },
    ],
  },
  networks: [
    {
      id: 0,
      type: 0,
      is_dirty: false,
      ssid: 'Best WiFi',
      password: '',
      keep_ap_active: true,
      ip_address: '192.168.1.100',
      mask: '255.255.255.0',
      gateway: '192.168.1.1',
      dns: '192.168.1.1',
      dhcp: false,
    },
    {
      id: 1,
      type: 0,
      is_dirty: false,
      ssid: 'Best WiFi 2',
      password: '',
      keep_ap_active: false,
      ip_address: '',
      mask: '',
      gateway: '',
      dns: '',
      dhcp: true,
    },
  ],
  pumps: [
    {
      id: 0,
      state: true,
      name: 'Magnesium',
      direction: true,
      running_hours: 412.5,
      tank_full_vol: 1000,
      tank_current_vol: 900,
      tank_concentration_total: 800,
      tank_concentration_active: 100,
      schedule: {
        mode: SCHEDULE_MODE.OFF,
        work_hours: [5, 8, 20, 21],
        weekdays: [0, 1, 2, 3, 4],
        speed: 1,
        time: 1,
        volume: 10,
      },
      calibration: [
        { speed: 1, flow: 1 },
        { speed: 2, flow: 2.1 },
        { speed: 10, flow: 22 },
        { speed: 40, flow: 85 },
      ],
    },
    {
      id: 1,
      state: true,
      name: 'CaRx',
      direction: true,
      running_hours: 1287.25,
      tank_full_vol: 1000,
      tank_current_vol: 900,
      tank_concentration_total: 800,
      tank_concentration_active: 800,
      schedule: {
        mode: SCHEDULE_MODE.OFF,
        work_hours: [5, 8, 20, 21],
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        speed: 1,
        time: 1,
        volume: 10,
      },
      calibration: [
        { speed: 1, flow: 1 },
        { speed: 2, flow: 2.1 },
        { speed: 10, flow: 22 },
        { speed: 40, flow: 85 },
      ],
    },
    {
      id: 2,
      state: true,
      name: 'Alkalinity',
      direction: true,
      running_hours: 863.4,
      tank_full_vol: 1000,
      tank_current_vol: 632,
      tank_concentration_total: 800,
      tank_concentration_active: 800,
      schedule: {
        mode: SCHEDULE_MODE.OFF,
        work_hours: [5, 8, 20, 21],
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        speed: 1,
        time: 1,
        volume: 10,
      },
      calibration: [
        { speed: 1, flow: 1 },
        { speed: 2, flow: 2.1 },
        { speed: 10, flow: 22 },
        { speed: 40, flow: 85 },
      ],
    },
    {
      id: 3,
      state: true,
      name: 'NO3',
      direction: true,
      running_hours: 219.75,
      tank_full_vol: 1000,
      tank_current_vol: 900,
      tank_concentration_total: 800,
      tank_concentration_active: 1800,
      schedule: {
        mode: SCHEDULE_MODE.OFF,
        work_hours: [5, 8, 20, 21],
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        speed: 1,
        time: 1,
        volume: 10,
      },
      calibration: [
        { speed: 1, flow: 1 },
        { speed: 2, flow: 2.1 },
        { speed: 10, flow: 22 },
        { speed: 40, flow: 85 },
      ],
    },
  ],
  status: {
    up_time: '1 day',
    local_time: '12:22',
    local_date: '2026-04-03',
    time_valid: true,
    time_warning: '',
    free_heap: 23567,
    vcc: 3.3,
    board_temperature: 25,
    wifi_mode: 'AP+STA',
    ip_address: '192.168.1.199',
    mac_address: '0A:EE:00:00:01:90',
    station_connected: true,
    station_ssid: 'Best WiFi',
    station_ip_address: '192.168.1.199',
    station_mac_address: '0A:EE:00:00:01:90',
    ap_ssid: 'stepper-doser',
    ap_ip_address: '192.168.4.1',
    ap_mac_address: '0A:EE:00:00:01:91',
    ap_clients: 1,
    mqtt_service: { enabled: false, connected: false },
    ntp_service: { enabled: true, sync: true },
    firmware_version: '1.1-dirty',
    firmware_date: '20/03/2026 11:02AM',
    hardware_version: 'ESP32',
    wifi_disconnects: 7,
    reboot_count: 14,
    last_reboot_reason: 'ESP_RST_POWERON',
    storage_backend: 'NVS fallback',
    rtc_backend: 'NTP fallback',
  },
  time: {
    time_zone: 'Europe/Madrid',
    date: '2026-04-03',
    time: '12:01:01',
  },
};

let state = clone(initialState);
let pumpRuntimeState: Record<number, MockPumpRuntimeState> = {};
const isMockDebugEnabled = import.meta.env.DEV && import.meta.env.VITE_API_DEBUG === 'true';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseRequestBody<T>(data: unknown): T {
  if (typeof data === 'string') {
    return JSON.parse(data) as T;
  }

  return (data ?? {}) as T;
}

function debugRequest(
  config: InternalAxiosRequestConfig,
  details: {
    method: string;
    url: string;
    requestBody?: unknown;
    responseBody?: unknown;
    status?: number;
    error?: unknown;
  }
) {
  if (!isMockDebugEnabled) {
    return;
  }

  const label = `[mock-api] ${details.method.toUpperCase()} ${details.url}`;
  console.groupCollapsed(label);
  console.info('request', {
    headers: config.headers,
    auth: getToken(config) ?? null,
    body: details.requestBody ?? null,
  });

  if (details.error) {
    console.error('error', {
      status: details.status ?? null,
      body: details.responseBody ?? null,
      error: details.error,
    });
  } else {
    console.info('response', {
      status: details.status ?? null,
      body: details.responseBody ?? null,
    });
  }

  console.groupEnd();
}

function normalizeUrl(url?: string): string {
  if (!url) {
    return '/';
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return new URL(url).pathname;
  }

  return url;
}

function getToken(config: AxiosRequestConfig): string | undefined {
  const headers = config.headers as
    | {
        Authorization?: unknown;
        authorization?: unknown;
        get?: (name: string) => unknown;
      }
    | undefined;

  const rawAuthorization =
    headers?.Authorization ??
    headers?.authorization ??
    headers?.get?.('Authorization') ??
    headers?.get?.('authorization');

  if (Array.isArray(rawAuthorization)) {
    return rawAuthorization[0];
  }
  if (typeof rawAuthorization === 'string') {
    return rawAuthorization;
  }
  return undefined;
}

function response<T>(config: InternalAxiosRequestConfig, data: T, status = 200, statusText = 'OK'): AxiosResponse<T> {
  return {
    config,
    data,
    headers: {},
    request: null,
    status,
    statusText,
  };
}

function rejectWithStatus(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
  statusText = 'Error'
): never {
  const error = new Error(`Request failed with status code ${status}`) as Error & {
    config: InternalAxiosRequestConfig;
    response: AxiosResponse;
    isAxiosError: boolean;
  };

  error.config = config;
  error.isAxiosError = true;
  error.response = response(config, data, status, statusText);

  throw error;
}

function applySettingsPatch(payload: Partial<SettingsState>) {
  if (payload.auth) {
    state.auth = clone(payload.auth);
  }
  if (payload.networks) {
    state.networks = clone(payload.networks);
  }
  if (payload.services) {
    state.services = clone(payload.services);
  }
  if (payload.time) {
    state.time = clone(payload.time);
  }
  if (payload.pumps) {
    state.pumps = clone(payload.pumps);
  }
}

function simulateUploadProgress(onUploadProgress?: (progressEvent: AxiosProgressEvent) => void) {
  if (!onUploadProgress) {
    return;
  }

  onUploadProgress({
    loaded: 1,
    total: 1,
    lengthComputable: true,
  } as AxiosProgressEvent);
}

function updatePumpRuntime(payload: PumpRunState) {
  const pump = state.pumps.find((item) => item.id === payload.id);
  if (!pump) {
    return;
  }

  if (payload.time === 0) {
    delete pumpRuntimeState[payload.id];
    emitPumpRuntimeUpdate(payload.id);
    return;
  }

  if (payload.time < 0) {
    pumpRuntimeState[payload.id] = {
      state: 'calibration',
      speed: payload.speed,
      direction: payload.direction,
      started_at: Date.now(),
      ends_at: null,
      duration_seconds: 0,
    };
    emitPumpRuntimeUpdate(payload.id);
    return;
  }

  const calibration = [...pump.calibration].sort((a, b) => a.speed - b.speed);
  const selected = calibration.find((item) => item.speed === payload.speed) ?? calibration[0];
  if (selected) {
    const pumpedVolume = Number(((selected.flow / 60) * payload.time).toFixed(2));
    pump.tank_current_vol = Number(Math.max(0, pump.tank_current_vol - pumpedVolume).toFixed(2));
    pump.running_hours = Number((pump.running_hours + payload.time / 60).toFixed(2));
  }

  pumpRuntimeState[payload.id] = {
    state: 'timed',
    speed: payload.speed,
    direction: payload.direction,
    started_at: Date.now(),
    ends_at: Date.now() + payload.time * 60 * 1000,
    duration_seconds: payload.time * 60,
  };
  emitPumpRuntimeUpdate(payload.id);
}

function syncPumpRuntimeState() {
  const now = Date.now();

  for (const [pumpId, runtime] of Object.entries(pumpRuntimeState)) {
    if (runtime.state === 'timed' && runtime.ends_at !== null && runtime.ends_at <= now) {
      delete pumpRuntimeState[Number(pumpId)];
    }
  }
}

function getPumpRuntimeEntries(): PumpRuntimeEntry[] {
  syncPumpRuntimeState();

  return state.pumps.map((pump) => {
    const runtime = pumpRuntimeState[pump.id];
    if (!runtime) {
      return {
        id: pump.id,
        active: false,
        state: 'off',
        speed: 0,
        direction: pump.direction,
        remaining_ticks: 0,
        remaining_seconds: 0,
        volume_ml: 0,
      };
    }

    const remainingSeconds =
      runtime.ends_at === null ? 0 : Math.max(0, Math.ceil((runtime.ends_at - Date.now()) / 1000));

    return {
      id: pump.id,
      active: true,
      state: runtime.state,
      speed: runtime.speed,
      direction: runtime.direction,
      remaining_ticks: runtime.state === 'timed' ? remainingSeconds * 100 : 0,
      remaining_seconds: runtime.state === 'timed' ? remainingSeconds : 0,
      volume_ml: 0,
    };
  });
}

function emitPumpRuntimeUpdate(pumpId: number) {
  const entry = getPumpRuntimeEntries().find((item) => item.id === pumpId);
  if (!entry) {
    return;
  }

  emitMockRealtimeMessage({
    type: 'pump_runtime',
    pump: entry,
  });
}

function ensureAuthorized(config: InternalAxiosRequestConfig, method: string, url: string, requestBody: unknown) {
  const token = getToken(config);
  if (!token || token === 'undefined') {
    const errorBody = { message: 'Unauthorized!' };
    debugRequest(config, { method, url, requestBody, responseBody: errorBody, status: 401, error: 'Unauthorized' });
    rejectWithStatus(config, 401, errorBody, 'Unauthorized');
  }
}

function simulateRestart(reason: StatusState['last_reboot_reason']) {
  state.status.reboot_count += 1;
  state.status.last_reboot_reason = reason;
  state.status.up_time = '0 min';
  state.status.local_time = new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function resolveWifiMode(): StatusState['wifi_mode'] {
  const wifiNetwork = state.networks.find((item) => item.type === 0);
  if (!wifiNetwork) {
    return 'AP+STA';
  }

  if ('keep_ap_active' in wifiNetwork && wifiNetwork.keep_ap_active) {
    return 'AP+STA';
  }

  return 'STA';
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase();
  const url = normalizeUrl(config.url);
  const requestBody = config.data;

  await new Promise((resolve) => setTimeout(resolve, 120));

  if (url === '/api/auth' && method === 'post') {
    const payload = parseRequestBody<{ username?: string; password?: string }>(config.data);

    if (payload.username !== state.auth.username || payload.password !== state.auth.password) {
      const errorBody = { message: 'Invalid username or password.' };
      debugRequest(config, { method, url, requestBody, responseBody: errorBody, status: 401, error: 'Unauthorized' });
      rejectWithStatus(config, 401, errorBody, 'Unauthorized');
    }

    const mockResponse = response(config, {
      success: true,
      token: 'dsfsdfsdfs',
    });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/status' && method === 'get') {
    ensureAuthorized(config, method, url, requestBody);

    const now = new Date();
    state.status.local_time = now.toLocaleTimeString('en-GB', { hour12: false });
    state.status.wifi_mode = resolveWifiMode();
    state.status.station_ssid = state.networks.find((item) => item.type === 0)?.ssid ?? '';
    state.status.station_connected = state.status.station_ssid.length > 0;
    state.status.station_ip_address = state.status.station_connected ? '192.168.1.199' : '';
    state.status.station_mac_address = state.status.station_connected ? '0A:EE:00:00:01:90' : '';
    state.status.ap_ssid = 'stepper-doser';
    state.status.ap_ip_address = '192.168.4.1';
    state.status.ap_mac_address = '0A:EE:00:00:01:91';
    state.status.ap_clients = state.status.wifi_mode === 'STA' ? 0 : 1;
    state.status.ip_address = state.status.station_connected ? state.status.station_ip_address : state.status.ap_ip_address;
    state.status.mac_address = state.status.station_connected ? state.status.station_mac_address : state.status.ap_mac_address;
    const mockResponse = response(config, { status: clone(state.status) });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/settings' && method === 'get') {
    ensureAuthorized(config, method, url, requestBody);
    const mockResponse = response(config, {
      pumps: clone(state.pumps),
      networks: clone(state.networks),
      services: clone(state.services),
      time: clone(state.time),
      auth: clone(state.auth),
    });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/settings' && method === 'post') {
    ensureAuthorized(config, method, url, requestBody);
    const payload = parseRequestBody<Partial<SettingsState>>(config.data);
    applySettingsPatch(payload);
    const mockResponse = response(config, { success: true });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/board-config' && method === 'get') {
    ensureAuthorized(config, method, url, requestBody);
    const mockResponse = response(config, clone(state.boardConfig));
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/board-config' && method === 'post') {
    ensureAuthorized(config, method, url, requestBody);
    const payload = parseRequestBody<BoardConfigState>(config.data);
    state.boardConfig = clone(payload);
    const mockResponse = response(config, { success: true });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/pumps/runtime' && method === 'get') {
    ensureAuthorized(config, method, url, requestBody);
    const mockResponse = response(config, { pumps: getPumpRuntimeEntries() });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/network/wifi/scan' && method === 'get') {
    ensureAuthorized(config, method, url, requestBody);
    const mockResponse = response(config, { networks: clone(mockWifiNetworks) });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/calibration' && method === 'post') {
    ensureAuthorized(config, method, url, requestBody);
    const mockResponse = response(config, { success: true });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/run' && method === 'post') {
    ensureAuthorized(config, method, url, requestBody);
    updatePumpRuntime(parseRequestBody<PumpRunState>(config.data));
    const mockResponse = response(config, { success: true });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/device/restart' && method === 'post') {
    ensureAuthorized(config, method, url, requestBody);
    simulateRestart('ESP_RST_SW');
    const mockResponse = response(config, { success: true, message: 'Device restart queued.' });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/device/factory-reset' && method === 'post') {
    ensureAuthorized(config, method, url, requestBody);
    state = clone(initialState);
    simulateRestart('ESP_RST_SW');
    const mockResponse = response(config, { success: true, message: 'Factory reset queued.' });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/upload' && method === 'post') {
    ensureAuthorized(config, method, url, requestBody);
    simulateUploadProgress(config.onUploadProgress);
    const mockResponse = response(config, { success: true });
    debugRequest(config, {
      method,
      url,
      requestBody: '[FormData]',
      responseBody: mockResponse.data,
      status: mockResponse.status,
    });
    return mockResponse;
  }

  const errorBody = { message: `Mock route not implemented: ${method.toUpperCase()} ${url}` };
  debugRequest(config, { method, url, requestBody, responseBody: errorBody, status: 404, error: 'Not Found' });
  rejectWithStatus(config, 404, errorBody, 'Not Found');
};

export function resetMockState() {
  state = clone(initialState);
  pumpRuntimeState = {};
}
