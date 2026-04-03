import { create } from 'zustand';

import {
  checkCredentials,
  CheckCredentialsState,
  getSettings,
  getStatus,
  NetworkState,
  PumpState,
  ServiceState,
  setSettings,
  SettingsSaveResponse,
  SettingsState,
  StatusState,
  UserCredentials,
} from '@/lib/api.ts';
import { http } from '@/lib/http.ts';

export type AppStoreState = {
  isAuthenticated: boolean;
  status: StatusState;
  settings: SettingsState;
  error: any;

  login: (user: UserCredentials) => Promise<boolean>;
  logout: () => void;
  loadStatus: () => void;
  loadSettings: () => void;
  saveSettings: (entity: string | string[] | null, data: Partial<SettingsState>) => Promise<boolean>;

  addNetwork: (data: Partial<NetworkState>) => void;
  deleteNetwork: (id: number) => Promise<boolean>;
  updateNetwork: (data: NetworkState) => Promise<boolean>;
  updateServices: (data: ServiceState) => Promise<boolean>;

  updatePump: (data: PumpState, persist: boolean) => Promise<boolean>;
  // deleteNetwork: (id: number) => void
};

export enum SettingsKey {
  services = 'services',
  auth = 'auth',
  networks = 'networks',
  pumps = 'pumps',
  time = 'time',
}

const useAppStore = create<AppStoreState>()((set, get) => ({
  isAuthenticated: !!localStorage.getItem('user-token'),
  status: {
    up_time: '',
    local_time: '',
    free_heap: 0,
    vcc: 3.3,
    board_temperature: 25,
    wifi_mode: 'STA',
    ip_address: '',
    mac_address: '',
    mqtt_service: { enabled: false, connected: false },
    ntp_service: { enabled: true, sync: true },
    firmware_version: '',
    firmware_date: '',
  },
  settings: {
    services: {
      hostname: '',
      ntp_server: '',
      utc_offset: 0,
      ntp_dst: false,
      mqtt_ip_address: '',
      mqtt_port: '',
      mqtt_user: '',
      mqtt_password: '',
      mqtt_qos: 0,
      enable_ntp: false,
      enable_mqtt: false,
      ota_url: '',
    },
    auth: {
      username: '',
      password: '',
    },
    networks: [],
    pumps: [],
    time: {
      time_zone: '',
      date: '',
      time: '',
    },
  },
  error: null,

  login: async (user: UserCredentials): Promise<boolean> => {
    try {
      const response = (await checkCredentials(user)) as CheckCredentialsState;
      const token = response.token;
      http.defaults.headers.common.Authorization = token;
      set(() => ({ isAuthenticated: true }));
      localStorage.setItem('user-token', token);
      return true;
    } catch (e) {
      console.log(e);
      set(() => ({ error: 'Failed to login' }));
      localStorage.removeItem('user-token');
      return false;
    }
  },

  logout: () => {
    set(() => ({ isAuthenticated: false }));
    localStorage.removeItem('user-token');
  },

  loadStatus: async () => {
    try {
      const response = (await getStatus()) as StatusState;
      set(() => ({
        status: response,
      }));
    } catch (e) {
      set(() => ({ error: 'Failed to load Status' }));
    }
  },

  loadSettings: async () => {
    try {
      const response = (await getSettings()) as SettingsState;
      set({
        settings: {
          auth: response.auth,
          services: response.services,
          networks: response.networks,
          pumps: response.pumps,
          time: response.time,
        },
      });
    } catch (e) {
      set({ error: 'Failed to load Settings' });
    }
  },

  saveSettings: async (entity: string | string[] | null, data: Partial<SettingsState>) => {
    try {
      const message: Partial<SettingsState> = {};
      const settings = get().settings as Partial<SettingsState>;

      // if (entity === null) {
      //     message = {
      //         networks: settings.networks,
      //         services: settings.services,
      //         pumps: settings.pumps,
      //         time: settings.time,
      //     };
      // } else {
      //     if (Array.isArray(entity)) {
      //         entity.forEach(i => {
      //             Object.keys(settings).forEach(key => {
      //                 if (key === i) {
      //                     const value:any = settings[key as keyof SettingsState];
      //                     message[key as keyof SettingsState] = value;
      //                 }
      //             });
      //         });
      //     } else {
      //         Object.keys(settings).forEach(key => {
      //             if (key === entity) {
      //                 const value:any = settings[key as keyof SettingsState];
      //                 message[key as keyof SettingsState] = value;
      //             }
      //         });
      //     }
      // }

      console.log({ entity, settings, data });
      return true;
      const response = await setSettings(message);
      console.log({ message, response });
      return true;
    } catch (e) {
      set(() => ({ error: 'Failed to load Status' }));
      return false;
    }
  },

  addNetwork: (data: Partial<NetworkState>) => {
    if (!data) {
      return false;
    }

    /* Check limits: one type -> one record */
    const networks = get().settings.networks;
    const count = networks.filter((x) => x.type === data.type).length;

    if (count === 1) {
      throw new Error('This connection already exists');
    }

    data.id = networks?.length ?? 0;
    const d = [...networks, ...[data]];
    set({
      settings: {
        ...get().settings,
        networks: d as NetworkState[],
      },
    });
    console.log(get());
  },

  updateNetwork: async (data: NetworkState): Promise<boolean> => {
    if (!data) {
      return false;
    }

    const networks = get().settings.networks;
    const idx = networks.findIndex((x) => x.id === data.id);
    if (idx != -1) {
      const d = [...networks];
      d[idx] = data;
      set({
        settings: {
          ...get().settings,
          networks: d,
        },
      });
      const response = (await setSettings({ networks: networks })) as SettingsSaveResponse;
      return response.success;
    }

    return false;
  },

  deleteNetwork: async (id: number): Promise<boolean> => {
    const networks = get().settings.networks;
    const idx = networks.findIndex((x) => x.id === id);
    if (idx == -1) {
      throw new Error('This connection already exists');
    }

    const d = [...networks];
    d.splice(idx, 1);

    set({
      settings: {
        ...get().settings,
        networks: d,
      },
    });
    const response = (await setSettings({ networks: networks })) as SettingsSaveResponse;
    return response.success;
  },

  updateServices: async (data: ServiceState): Promise<boolean> => {
    if (!data) {
      return false;
    }

    set({
      settings: {
        ...get().settings,
        services: data,
      },
    });
    const response = (await setSettings({ services: data })) as SettingsSaveResponse;
    return response.success;
  },

  updatePump: async (data: PumpState, persist: boolean): Promise<boolean> => {
    if (!data) {
      return false;
    }
    data.calibration.sort((a, b) => a.speed - b.speed);

    const pumps = get().settings.pumps;
    const idx = pumps.findIndex((x) => x.id === data.id);
    if (idx != -1) {
      pumps[idx] = data;
      set((state) => ({
        settings: { ...state.settings, pumps: pumps },
      }));
      if (persist) {
        const response = (await setSettings({ pumps: pumps })) as SettingsSaveResponse;
        return response.success;
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
