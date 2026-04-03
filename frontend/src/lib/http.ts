import axios from 'axios';
import { mockAdapter } from '@/lib/mock-backend.ts';

function normalizeDeviceBaseUrl(deviceIp?: string): string | null {
  if (!deviceIp) {
    return null;
  }

  const trimmed = deviceIp.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  return `http://${trimmed}/`;
}

const deviceBaseUrl = normalizeDeviceBaseUrl(import.meta.env.VITE_DEVICE_IP);
const isMockEnabled = import.meta.env.DEV && !deviceBaseUrl && import.meta.env.VITE_API_MOCK !== 'false';
const host = deviceBaseUrl ?? (import.meta.env.PROD ? `http://${document.location.host}/` : 'http://localhost:8095/');

export const http = axios.create({
  baseURL: host,
  adapter: isMockEnabled ? mockAdapter : undefined,
});

// Attach Authorization header from localStorage, if present
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('user-token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = token;
  }
  return config;
});

// Global response interceptor: redirect to login on 401
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error && error.response && error.response.status === 401) {
      // Hard redirect keeps it framework-agnostic
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
