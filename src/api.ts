import { storage, StoreName } from './storage/indexedDB';

const rawApiUrl = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

console.log(`[API] Initialized with BASE: ${API_BASE}`);

export async function apiFetch(endpoint: string, options: any = {}) {
  const tokenData = await storage.get(StoreName.USER_DATA, 'auth_token');
  const token = tokenData?.value;

  // Ensure endpoint starts with /
      const cleanEndpoint = '/api' + (endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
  const url = `${API_BASE}${cleanEndpoint}`;
  console.log(`[apiFetch] Requesting: ${url}`, options);

  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  console.log('Token for request:', token ? 'EXISTS' : 'MISSING');

  // 15-second timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`[apiFetch] Error response from ${url}:`, error);
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[apiFetch] Request timed out: ${url}`);
      throw new Error('Request timed out');
    }
    console.error(`[apiFetch] Network error or exception for ${url}:`, err);
    throw err;
  }
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, nickname: string) =>
    apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nickname }),
    }),
  me: () => apiFetch('/auth/me'),
};

export const userApi = {
  search: (query: string) =>
    apiFetch(`/users/search?query=${encodeURIComponent(query)}`),
  getPublicKey: (userId: number) =>
    apiFetch(`/users/${userId}/public-key`),
  updatePublicKey: (publicKey: string) =>
    apiFetch('/users/public-key', {
      method: 'POST',
      body: JSON.stringify({ publicKey }),
    }),
};

export const chatApi = {
  list: () => apiFetch('/chats'),
  create: (data: any) =>
    apiFetch('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (chatId: number) =>
    apiFetch(`/chats/${chatId}`, { method: 'DELETE' }),
  getMessages: (chatId: number, limit = 50, before?: number) =>
    apiFetch(`/chats/${chatId}/messages?limit=${limit}${before ? `&before=${before}` : ''}`),
  markRead: (chatId: number) =>
    apiFetch(`/chats/${chatId}/read`, { method: 'POST' }),
  getSavedMessages: () => apiFetch('/chats/saved-messages'),
  toggleSaveMessage: (messageId: number) =>
    apiFetch(`/chats/messages/${messageId}/save`, { method: 'POST' }),
};

export const fileApi = {
  upload: (formData: FormData) =>
    apiFetch('/files/upload', {
      method: 'POST',
      headers: {},
      body: formData,
    }),
};
