import React from 'react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { getWebSocketUrl, isMockApiEnabled } from '@/lib/http.ts';
import { emitMockRealtimeMessage, registerMockRealtimePeer, unregisterMockRealtimePeer } from '@/lib/realtime-mock.ts';
import { getStoredAuthToken } from '@/lib/auth-storage.ts';

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'paused';
type RealtimeSystemState = 'normal' | 'restarting';

type RealtimeContextValue = {
  status: RealtimeStatus;
  systemState: RealtimeSystemState;
  attempt: number;
  lastPongAt: number | null;
  reconnectNow: () => void;
  lastMessage: unknown | null;
};

const RealtimeContext = React.createContext<RealtimeContextValue>({
  status: 'idle',
  systemState: 'normal',
  attempt: 0,
  lastPongAt: null,
  reconnectNow: () => undefined,
  lastMessage: null,
});

const HEARTBEAT_INTERVAL_MS = 15000;
const RECONNECT_INTERVAL_MS = 2500;
const RECONNECT_PAUSE_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;

function createMockSocket(onOpen: () => void, onMessage: (event: MessageEvent<string>) => void, onClose: () => void) {
  let closed = false;
  const clientId = registerMockRealtimePeer(onMessage, onClose);

  window.setTimeout(() => {
    if (!closed) {
      onOpen();
      onMessage(new MessageEvent('message', { data: JSON.stringify({ type: 'welcome', client_fd: clientId }) }));
    }
  }, 150);

  return {
    readyState: WebSocket.OPEN,
    send(data: string) {
      if (closed) {
        return;
      }

      try {
        const message = JSON.parse(data) as { type?: string };
        if (message.type === 'ping') {
          window.setTimeout(() => {
            if (!closed) {
              onMessage(
                new MessageEvent('message', {
                  data: JSON.stringify({ type: 'pong', ts: Date.now(), client_fd: clientId }),
                })
              );
            }
          }, 80);
        } else if (message.type === 'broadcast:test') {
          emitMockRealtimeMessage({ type: 'broadcast', event: 'test', source_fd: clientId });
        }
      } catch (_error) {
        // Ignore invalid mock payloads.
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      unregisterMockRealtimePeer(clientId);
      onClose();
    },
  };
}

export function RealtimeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const isAuthenticated = useAppStore((state: AppStoreState) => state.isAuthenticated);
  const loadStatus = useAppStore((state: AppStoreState) => state.loadStatus);
  const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);
  const applyRealtimeStatus = useAppStore((state: AppStoreState) => state.applyRealtimeStatus);
  const applyRealtimeSettings = useAppStore((state: AppStoreState) => state.applyRealtimeSettings);
  const [status, setStatus] = React.useState<RealtimeStatus>('idle');
  const [systemState, setSystemState] = React.useState<RealtimeSystemState>('normal');
  const [attempt, setAttempt] = React.useState(0);
  const [lastPongAt, setLastPongAt] = React.useState<number | null>(null);
  const [lastMessage, setLastMessage] = React.useState<unknown | null>(null);
  const socketRef = React.useRef<WebSocket | ReturnType<typeof createMockSocket> | null>(null);
  const reconnectTimerRef = React.useRef<number | null>(null);
  const heartbeatTimerRef = React.useRef<number | null>(null);
  const pausedRef = React.useRef(false);
  const attemptRef = React.useRef(0);
  const shouldReconnectRef = React.useRef(true);

  const clearTimers = React.useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const disconnect = React.useCallback(() => {
    clearTimers();
    shouldReconnectRef.current = false;
    socketRef.current?.close();
    socketRef.current = null;
  }, [clearTimers]);

  const connect = React.useCallback(() => {
    if (!isAuthenticated) {
      disconnect();
      setStatus('idle');
      attemptRef.current = 0;
      setAttempt(0);
      return;
    }

    const token = getStoredAuthToken();
    if (!token) {
      disconnect();
      setStatus('idle');
      attemptRef.current = 0;
      setAttempt(0);
      return;
    }

    if (pausedRef.current) {
      setStatus('paused');
      return;
    }

    disconnect();
    shouldReconnectRef.current = true;
    setStatus(attemptRef.current > 0 ? 'reconnecting' : 'connecting');

    const handleOpen = () => {
      setStatus('connected');
      attemptRef.current = 0;
      setAttempt(0);
      setLastPongAt(Date.now());

      heartbeatTimerRef.current = window.setInterval(() => {
        socketRef.current?.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      }, HEARTBEAT_INTERVAL_MS);

      socketRef.current?.send(JSON.stringify({ type: 'hello' }));
      socketRef.current?.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    };

    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; status?: unknown };
        if (message.type === 'pong' || message.type === 'welcome') {
          setLastPongAt(Date.now());
          if (message.type === 'welcome') {
            void loadStatus();
            void loadSettings();
          }
        } else if (message.type === 'shutting_down') {
          setSystemState('restarting');
        } else if (message.type === 'system_ready') {
          setSystemState('normal');
          void loadStatus();
          void loadSettings();
        } else if ((message.type === 'status_patch' || message.type === 'status_update') && message.status) {
          applyRealtimeStatus(message.status as Parameters<AppStoreState['applyRealtimeStatus']>[0]);
        } else if (message.type === 'settings_update') {
          applyRealtimeSettings(message as Parameters<AppStoreState['applyRealtimeSettings']>[0]);
        }
        setLastMessage(message);
      } catch (_error) {
        // Ignore malformed messages.
      }
    };

    const handleClose = () => {
      clearTimers();
      socketRef.current = null;

      if (!shouldReconnectRef.current) {
        return;
      }

      const nextAttempt = attemptRef.current + 1;
      attemptRef.current = nextAttempt;
      setAttempt(nextAttempt);

      if (nextAttempt >= MAX_RECONNECT_ATTEMPTS) {
        pausedRef.current = true;
        setStatus('paused');
        toast.error('Backend realtime link paused after repeated reconnect failures.');
        reconnectTimerRef.current = window.setTimeout(() => {
          pausedRef.current = false;
          attemptRef.current = 0;
          setAttempt(0);
          connect();
        }, RECONNECT_PAUSE_MS);
        return;
      }

      setStatus('reconnecting');
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, RECONNECT_INTERVAL_MS);
    };

    if (isMockApiEnabled) {
      socketRef.current = createMockSocket(handleOpen, handleMessage, handleClose);
      return;
    }

    const url = getWebSocketUrl(token);
    if (!url) {
      setStatus('paused');
      return;
    }

    const socket = new WebSocket(url);
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage as EventListener);
    socket.addEventListener('close', handleClose);
    socket.addEventListener('error', () => {
      socket.close();
    });
    socketRef.current = socket;
  }, [applyRealtimeSettings, applyRealtimeStatus, clearTimers, disconnect, isAuthenticated, loadSettings, loadStatus]);

  React.useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect, isAuthenticated]);

  const reconnectNow = React.useCallback(() => {
    pausedRef.current = false;
    attemptRef.current = 0;
    setAttempt(0);
    connect();
  }, [connect]);

  const value = React.useMemo(
    () => ({
      status,
      systemState,
      attempt,
      lastPongAt,
      reconnectNow,
      lastMessage,
    }),
    [attempt, lastMessage, lastPongAt, reconnectNow, status, systemState]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeConnection() {
  return React.useContext(RealtimeContext);
}
