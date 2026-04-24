import { create } from 'zustand';

import {
  checkCredentials,
  CheckCredentialsState,
  DeviceActionResponse,
  factoryResetDevice as runFactoryReset,
  getSettings,
  getStatus,
  NetworkState,
  PumpState,
  restartDevice as runRestart,
  ServiceState,
  setSettings,
  SettingsSaveResponse,
  SettingsState,
  StatusPatch,
  StatusState,
  UserCredentials,
} from '@/lib/api.ts';
import { http } from '@/lib/http.ts';
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '@/lib/auth-storage.ts';

function cloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function roundToHundredths(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizePump(pump: PumpState): PumpState {
  return {
    ...pump,
    tank_current_vol: roundToHundredths(pump.tank_current_vol),
    max_single_run_ml: pump.max_single_run_ml ?? 0,
    max_single_run_seconds: pump.max_single_run_seconds ?? 0,
    max_hourly_ml: pump.max_hourly_ml ?? 0,
    max_daily_ml: pump.max_daily_ml ?? 0,
  };
}

function normalizePumps(pumps: PumpState[]): PumpState[] {
  return pumps.map((pump) => normalizePump(pump));
}

function normalizeSettingsState(settings: SettingsState): SettingsState {
  return {
    auth: cloneSettings(settings.auth),
    app: cloneSettings(settings.app),
    services: cloneSettings(settings.services),
    networks: cloneSettings(settings.networks),
    pumps: normalizePumps(settings.pumps),
    time: cloneSettings(settings.time),
  };
}

export type AppStoreState = {
  isAuthenticated: boolean;
  status: StatusState;
  settings: SettingsState;
  error: any;

  login: (user: UserCredentials) => Promise<boolean>;
  logout: () => void;
  loadStatus: () => Promise<StatusState | null>;
  loadSettings: () => Promise<SettingsState | null>;
  applyRealtimeStatus: (status: StatusPatch) => void;
  applyRealtimeSettings: (settings: SettingsState) => void;
  saveSettings: (entity: string | string[] | null, data: Partial<SettingsState>) => Promise<boolean>;
  restartDevice: () => Promise<boolean>;
  factoryResetDevice: () => Promise<boolean>;

  addNetwork: (data: Partial<NetworkState>) => Promise<boolean>;
  deleteNetwork: (id: number) => Promise<boolean>;
  updateNetwork: (data: NetworkState) => Promise<boolean>;
  updateServices: (data: ServiceState) => Promise<boolean>;

  updatePump: (data: PumpState, persist: boolean) => Promise<boolean>;
  // deleteNetwork: (id: number) => void
};

export enum SettingsKey {
  services = 'services',
  auth = 'auth',
  app = 'app',
  networks = 'networks',
  pumps = 'pumps',
  time = 'time',
}

const defaultStatus: StatusState = {
  up_time: '',
  local_time: '',
  local_date: '',
  time_valid: true,
  time_warning: '',
  free_heap: 0,
  vcc: 3.3,
  board_temperature: 25,
  wifi_mode: 'AP+STA',
  ip_address: '',
  mac_address: '',
  station_connected: false,
  station_ssid: '',
  station_ip_address: '',
  station_mac_address: '',
  ap_ssid: '',
  ap_ip_address: '',
  ap_mac_address: '',
  ap_clients: 0,
  mqtt_service: { enabled: false, connected: false, last_error: '' },
  ntp_service: { enabled: true, sync: true },
  firmware_version: '',
  firmware_date: '',
  hardware_version: '',
  wifi_disconnects: 0,
  reboot_count: 0,
  last_reboot_reason: '',
  storage_backend: '',
  rtc_backend: '',
};

const defaultSettings: SettingsState = {
  services: {
    hostname: '',
    ntp_server: '',
    time_zone: 'UTC',
    mqtt_ip_address: '',
    mqtt_port: '',
    mqtt_user: '',
    mqtt_password: '',
    mqtt_qos: 0,
    mqtt_retain: false,
    mqtt_discovery_topic: 'homeassistant',
    mqtt_discovery_status_topic: 'homeassistant/status',
    max_total_daily_ml: 0,
    enable_ntp: false,
    enable_mqtt: false,
    enable_mqtt_discovery: true,
    ota_url: '',
  },
  auth: {
    username: '',
    password: '',
  },
  app: {
    onboarding_completed: true,
  },
  networks: [],
  pumps: [],
  time: {
    time_zone: '',
    date: '',
    time: '',
  },
};

const useAppStore = create<AppStoreState>()((set, get) => ({
  isAuthenticated: !!getStoredAuthToken(),
  status: cloneSettings(defaultStatus),
  settings: cloneSettings(defaultSettings),
  error: null,

  login: async (user: UserCredentials): Promise<boolean> => {
    try {
      const response = (await checkCredentials(user)) as CheckCredentialsState;
      const token = response.token;
      http.defaults.headers.common.Authorization = token;
      setStoredAuthToken(token);
      set(() => ({ isAuthenticated: true, error: null }));
      return true;
    } catch (e) {
      const message =
        typeof e === 'object' &&
        e !== null &&
        'response' in e &&
        typeof e.response === 'object' &&
        e.response !== null &&
        'data' in e.response &&
        typeof e.response.data === 'object' &&
        e.response.data !== null &&
        'message' in e.response.data &&
        typeof e.response.data.message === 'string'
          ? e.response.data.message
          : 'Failed to login';

      set(() => ({ error: message, isAuthenticated: false }));
      delete http.defaults.headers.common.Authorization;
      clearStoredAuthToken();
      return false;
    }
  },

  logout: () => {
    set(() => ({ isAuthenticated: false, error: null }));
    delete http.defaults.headers.common.Authorization;
    clearStoredAuthToken();
  },

  loadStatus: async () => {
    try {
      const response = (await getStatus()) as StatusState;
      set(() => ({
        status: response,
        error: null,
      }));
      return response;
    } catch (e) {
      set(() => ({ error: 'Failed to load Status' }));
      return null;
    }
  },

  loadSettings: async () => {
    try {
      const response = (await getSettings()) as SettingsState;
      const normalizedSettings = normalizeSettingsState(response);
      set({
        settings: normalizedSettings,
        error: null,
      });
      return normalizedSettings;
    } catch (e) {
      set({ error: 'Failed to load Settings' });
      return null;
    }
  },

  applyRealtimeStatus: (status: StatusPatch) => {
    set((state) => ({
      status: {
        ...state.status,
        ...cloneSettings(status),
      },
      error: null,
    }));
  },

  applyRealtimeSettings: (settings: SettingsState) => {
    const normalizedSettings = normalizeSettingsState(settings);
    set(() => ({
      settings: normalizedSettings,
      error: null,
    }));
  },

  saveSettings: async (entity: string | string[] | null, data: Partial<SettingsState>) => {
    try {
      let message: Partial<SettingsState>;

      if (entity === null) {
        message = cloneSettings(data);
      } else if (Array.isArray(entity)) {
        message = entity.reduce<Partial<SettingsState>>((acc, key) => {
          const value = data[key as keyof SettingsState];
          if (value !== undefined) {
            acc[key as keyof SettingsState] = cloneSettings(value) as never;
          }
          return acc;
        }, {});
      } else {
        const value = data[entity as keyof SettingsState];
        message = value !== undefined ? { [entity]: cloneSettings(value) } : {};
      }

      const response = (await setSettings(message)) as SettingsSaveResponse;
      set(() => ({
        settings: normalizeSettingsState(response),
        error: null,
      }));
      return true;
    } catch (e) {
      set(() => ({ error: 'Failed to save settings' }));
      return false;
    }
  },

  restartDevice: async () => {
    try {
      const response = (await runRestart<DeviceActionResponse>()) as DeviceActionResponse;
      if (response.success) {
        const status = await get().loadStatus();
        set(() => ({
          error: null,
          status: status ?? get().status,
        }));
      }
      return response.success;
    } catch (e) {
      set(() => ({ error: 'Failed to restart device' }));
      return false;
    }
  },

  factoryResetDevice: async () => {
    try {
      const response = (await runFactoryReset<DeviceActionResponse>()) as DeviceActionResponse;
      if (response.success) {
        delete http.defaults.headers.common.Authorization;
        localStorage.removeItem('user-token');
        set(() => ({
          isAuthenticated: false,
          error: null,
          status: cloneSettings(defaultStatus),
          settings: cloneSettings(defaultSettings),
        }));
      }
      return response.success;
    } catch (e) {
      set(() => ({ error: 'Failed to factory reset device' }));
      return false;
    }
  },

  addNetwork: async (data: Partial<NetworkState>) => {
    if (!data) {
      return false;
    }

    /* Check limits: one type -> one record */
    const networks = get().settings.networks;
    const count = networks.filter((x) => x.type === data.type).length;

    if (count === 1) {
      throw new Error('This connection already exists');
    }

    const nextNetwork = {
      ...cloneSettings(data),
      id: networks.length ?? 0,
      is_dirty: true,
    } as NetworkState;
    const nextNetworks = [...networks, nextNetwork];

    const previousSettings = cloneSettings(get().settings);
    set({
      settings: {
        ...get().settings,
        networks: nextNetworks,
      },
    });
    try {
      const response = (await setSettings({ networks: nextNetworks })) as SettingsSaveResponse;
      set(() => ({
        settings: normalizeSettingsState(response),
        error: null,
      }));
      return true;
    } catch (e) {
      set(() => ({ settings: previousSettings, error: 'Failed to save settings' }));
      return false;
    }
  },

  updateNetwork: async (data: NetworkState): Promise<boolean> => {
    if (!data) {
      return false;
    }

    const networks = get().settings.networks;
    const idx = networks.findIndex((x) => x.id === data.id);
    if (idx != -1) {
      const nextNetworks = [...networks];
      nextNetworks[idx] = {
        ...cloneSettings(data),
        is_dirty: false,
      };
      const previousSettings = cloneSettings(get().settings);
      set({
        settings: {
          ...get().settings,
          networks: nextNetworks,
        },
      });
      try {
        const response = (await setSettings({ networks: nextNetworks })) as SettingsSaveResponse;
        set(() => ({
          settings: normalizeSettingsState(response),
          error: null,
        }));
        return true;
      } catch (e) {
        set(() => ({ settings: previousSettings, error: 'Failed to save settings' }));
        return false;
      }
    }

    return false;
  },

  deleteNetwork: async (id: number): Promise<boolean> => {
    const networks = get().settings.networks;
    const idx = networks.findIndex((x) => x.id === id);
    if (idx == -1) {
      throw new Error('This connection already exists');
    }

    const nextNetworks = [...networks];
    nextNetworks.splice(idx, 1);

    const previousSettings = cloneSettings(get().settings);
    set({
      settings: {
        ...get().settings,
        networks: nextNetworks,
      },
    });
    try {
      const response = (await setSettings({ networks: nextNetworks })) as SettingsSaveResponse;
      set(() => ({
        settings: normalizeSettingsState(response),
        error: null,
      }));
      return true;
    } catch (e) {
      set(() => ({ settings: previousSettings, error: 'Failed to save settings' }));
      return false;
    }
  },

  updateServices: async (data: ServiceState): Promise<boolean> => {
    if (!data) {
      return false;
    }

    const nextServices = cloneSettings(data);
    const previousSettings = cloneSettings(get().settings);
    set({
      settings: {
        ...get().settings,
        services: nextServices,
      },
    });
    try {
      const response = (await setSettings({ services: nextServices })) as SettingsSaveResponse;
      set(() => ({
        settings: normalizeSettingsState(response),
        error: null,
      }));
      return true;
    } catch (e) {
      set(() => ({ settings: previousSettings, error: 'Failed to save settings' }));
      return false;
    }
  },

  updatePump: async (data: PumpState, persist: boolean): Promise<boolean> => {
    if (!data) {
      return false;
    }

    const nextPump = normalizePump(cloneSettings(data));
    nextPump.calibration = [...nextPump.calibration].sort((a, b) => a.speed - b.speed);

    const pumps = get().settings.pumps;
    const idx = pumps.findIndex((x) => x.id === nextPump.id);
    if (idx != -1) {
      const currentPump = pumps[idx];
      const nextPumps = [...pumps];
      nextPumps[idx] = {
        ...currentPump,
        ...nextPump,
        aging: nextPump.aging ?? currentPump.aging,
      };
      const previousSettings = cloneSettings(get().settings);
      set((state) => ({
        settings: { ...state.settings, pumps: nextPumps },
      }));
      if (persist) {
        try {
          const response = (await setSettings({ pumps: nextPumps })) as SettingsSaveResponse;
          set(() => ({
            settings: normalizeSettingsState(response),
            error: null,
          }));
          return true;
        } catch (e) {
          set(() => ({ settings: previousSettings, error: 'Failed to save settings' }));
          return false;
        }
      }
      return true;
    }

    return false;
  },

  //
  // setPumps (payload) {
  //     this.state.pumps = JSON.parse(JSON.stringify(payload))
  // },
}));

export { useAppStore };
