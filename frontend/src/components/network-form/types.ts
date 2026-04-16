import { NetworkType } from '@/lib/api.ts';

export type FormData = {
  id?: number;
  ssid: string;
  password: string;
  keep_ap_active: boolean;
  ip_address: string;
  mask: string;
  gateway: string;
  dns: string;
  dhcp: boolean;
  vlan_tag?: number;
  type: NetworkType;
};
