import { storage, StoreName } from './storage/indexedDB';

const rawApiUrl = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

console.log(`[API] Initialized with BASE: ${API_BASE}`);

export async function apiFetch(endpoint: string, options: any = {}) {
  const tokenData = await storage.get(StoreName.USER_DATA, 'auth_token');
  const token = tokenData?.value;
  
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${cleanEndpoint}`;
  console.log(`[apiFetch] Requesting: ${url}`, options);

  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  console.log('Token for request:', token ? 'EXISTS' : 'MISSING');
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`[apiFetch] Error response from ${url}:`, error);
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  } catch (err: any) {
    console.error(`[apiFetch] Network error or exception for ${url}:`, err);
    throw err;
  }
}

export const authApi = {
  register: (data: any) => apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
};

export const chatApi = {
  list: () => apiFetch('/api/chats'),
  create: (data: any) => apiFetch('/api/chats', { method: 'POST', body: JSON.stringify(data) }),
  getMessages: (chatId: number) => apiFetch(`/api/chats/${chatId}/messages`),
  getParticipants: (chatId: number) => apiFetch(`/api/chats/${chatId}/participants`),
  getSavedMessages: () => apiFetch('/api/chats/saved-messages'),
  toggleFavorite: (chatId: number) => apiFetch(`/api/chats/${chatId}/favorite`, { method: 'POST' }),
  toggleSaveMessage: (messageId: number) => apiFetch(`/api/chats/messages/${messageId}/save`, { method: 'POST' }),
  delete: (chatId: number) => apiFetch(`/api/chats/${chatId}`, { method: 'DELETE' }),
  uploadFile: async (file: File, chatId: number) => {
    const tokenData = await storage.get(StoreName.USER_DATA, 'auth_token');
    const token = tokenData?.value;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chat_id', chatId.toString());
    const res = await fetch(`${API_BASE}/api/files/simple-upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      },
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  }
};

export const userApi = {
  search: (query: string) => apiFetch(`/api/users/search?query=${encodeURIComponent(query)}`),
  updatePublicKey: (publicKey: string) => apiFetch('/api/users/public-key', { method: 'POST', body: JSON.stringify({ publicKey }) }),
  getPublicKey: (userId: number) => apiFetch(`/api/users/${userId}/public-key`),
};

export const fileApi = {
  upload: async (formData: FormData) => {
    const tokenData = await storage.get(StoreName.USER_DATA, 'auth_token');
    const token = tokenData?.value;
    return fetch(`${API_BASE}/api/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
    }).then(res => res.json());
  },
  download: async (fileId: number) => {
    const tokenData = await storage.get(StoreName.USER_DATA, 'auth_token');
    const token = tokenData?.value;
    return fetch(`${API_BASE}/api/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
    }).then(res => res.blob());
  }
};
