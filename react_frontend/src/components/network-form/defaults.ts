import { NetworkStateBle, NetworkStateEthernet, NetworkStateThread, NetworkStateWifi, NetworkType } from '@/lib/api.ts';

export const defaultsWifi: Partial<NetworkStateWifi> = {
  ssid: '',
  password: '',
  ip_address: '0.0.0.0',
  mask: '255.255.255.0',
  gateway: '0.0.0.0',
  dns: '0.0.0.0',
  dhcp: true,
  type: NetworkType.WiFi,
};

export const defaultsEthernet: Partial<NetworkStateEthernet> = {
  ip_address: '0.0.0.0',
  mask: '255.255.255.0',
  gateway: '0.0.0.0',
  dns: '0.0.0.0',
  dhcp: true,
  type: NetworkType.Ethernet,
};

export const defaultsBle: Partial<NetworkStateBle> = {
  type: NetworkType.BLE,
};

export const defaultsThread: Partial<NetworkStateThread> = {
  channel: 13,
  network_name: 'OpenThread-8fab',
  network_key: '0xdfd34f0f05cad978ec4e32b0413038ff',
  pan_id: '0x8f28',
  ext_pan_id: '0xd63e8e3e495ebbc3',
  pskc: '0xc23a76e98f1a6483639b1ac1271e2e27',
  mesh_local_prefix: 'fd53:145f:ed22:ad81::/64',
  force_dataset: true,
  type: NetworkType.Thread,
};

export const defaultsCan = {
  node_is: 1,
  type: NetworkType.CAN,
};
