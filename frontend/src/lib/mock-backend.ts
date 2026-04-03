import type {
  AxiosAdapter,
  AxiosProgressEvent,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

import type {
  AuthState,
  NetworkState,
  PumpRunState,
  PumpState,
  ServiceState,
  SettingsState,
  StatusState,
  TimeState,
} from '@/lib/api.ts';

type MockState = {
  auth: AuthState;
  networks: NetworkState[];
  pumps: PumpState[];
  services: ServiceState;
  status: StatusState;
  time: TimeState;
};

const SCHEDULE_MODE = {
  OFF: 0,
  PERIODIC: 1,
  CONTINUOUS: 2,
} as const;

const initialState: MockState = {
  services: {
    hostname: 'test',
    ntp_server: '',
    utc_offset: 0,
    ntp_dst: true,
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
    password: '12345678',
  },
  networks: [
    {
      id: 0,
      type: 0,
      is_dirty: false,
      ssid: 'Best WiFi',
      password: '',
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
    free_heap: 23567,
    vcc: 3.3,
    board_temperature: 25,
    wifi_mode: 'STA',
    ip_address: '192.168.1.199',
    mac_address: '0A:EE:00:00:01:90',
    mqtt_service: { enabled: false, connected: false },
    ntp_service: { enabled: true, sync: true },
    firmware_version: '1.1-dirty',
    firmware_date: '20/03/2026 11:02AM',
    hardware_version: 'ESP32',
  },
  time: {
    time_zone: 'UTC+1',
    date: '2026-04-03',
    time: '12:01:01',
  },
};

let state = clone(initialState);
const isMockDebugEnabled = import.meta.env.DEV && import.meta.env.VITE_API_DEBUG === 'true';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
  const rawAuthorization = config.headers?.Authorization ?? config.headers?.authorization;
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
  if (!pump || payload.time <= 0) {
    return;
  }

  const calibration = [...pump.calibration].sort((a, b) => a.speed - b.speed);
  const selected = calibration.find((item) => item.speed === payload.speed) ?? calibration[0];
  if (!selected) {
    return;
  }

  const pumpedVolume = Number(((selected.flow / 60) * payload.time).toFixed(2));
  pump.tank_current_vol = Math.max(0, pump.tank_current_vol - pumpedVolume);
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase();
  const url = normalizeUrl(config.url);
  const requestBody = config.data;

  await new Promise((resolve) => setTimeout(resolve, 120));

  if (url === '/api/auth' && method === 'post') {
    const mockResponse = response(config, {
      success: true,
      token: 'dsfsdfsdfs',
    });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/status' && method === 'get') {
    const token = getToken(config);
    if (!token || token === 'undefined') {
      const errorBody = { message: 'Unauthorized!' };
      debugRequest(config, { method, url, requestBody, responseBody: errorBody, status: 401, error: 'Unauthorized' });
      rejectWithStatus(config, 401, errorBody, 'Unauthorized');
    }

    const now = new Date();
    state.status.local_time = now.toLocaleTimeString('en-GB', { hour12: false });
    const mockResponse = response(config, { status: clone(state.status) });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/settings' && method === 'get') {
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
    const payload = (config.data ?? {}) as Partial<SettingsState>;
    applySettingsPatch(payload);
    const mockResponse = response(config, { success: true });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/calibration' && method === 'post') {
    const mockResponse = response(config, { success: true });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/api/run' && method === 'post') {
    updatePumpRuntime((config.data ?? {}) as PumpRunState);
    const mockResponse = response(config, { success: true });
    debugRequest(config, { method, url, requestBody, responseBody: mockResponse.data, status: mockResponse.status });
    return mockResponse;
  }

  if (url === '/upload' && method === 'post') {
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
}
