type MockSocketPeer = {
  id: number;
  emitMessage: (event: MessageEvent<string>) => void;
  emitClose: () => void;
};

let mockSocketSequence = 1;
const mockSocketPeers = new Map<number, MockSocketPeer>();

export function registerMockRealtimePeer(
  emitMessage: (event: MessageEvent<string>) => void,
  emitClose: () => void
): number {
  const clientId = mockSocketSequence++;
  mockSocketPeers.set(clientId, { id: clientId, emitMessage, emitClose });
  return clientId;
}

export function unregisterMockRealtimePeer(clientId: number) {
  mockSocketPeers.delete(clientId);
}

export function emitMockRealtimeMessage(message: unknown) {
  const payload = JSON.stringify(message);
  for (const peer of mockSocketPeers.values()) {
    window.setTimeout(() => {
      peer.emitMessage(new MessageEvent('message', { data: payload }));
    }, 20);
  }
}
