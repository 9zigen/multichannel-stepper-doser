export const AUTH_TOKEN_KEY = 'user-token';
export const AUTH_STATE_EVENT = 'app-auth-state-changed';

function emitAuthState() {
  window.dispatchEvent(
    new CustomEvent(AUTH_STATE_EVENT, {
      detail: {
        isAuthenticated: Boolean(localStorage.getItem(AUTH_TOKEN_KEY)),
      },
    })
  );
}

export function getStoredAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  emitAuthState();
}

export function clearStoredAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  emitAuthState();
}
