import { NetworkType } from '@/lib/api.ts';

export type FormData = {
  id?: number;
  ssid: string;
  password: string;
  ip_address: string;
  mask: string;
  gateway: string;
  dns: string;
  dhcp: boolean;
  type: NetworkType;
};
