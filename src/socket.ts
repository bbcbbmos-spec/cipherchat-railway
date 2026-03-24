import { io, Socket } from 'socket.io-client';
import { storage, StoreName } from './storage/indexedDB';

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    const rawSocketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || window.location.origin;
    const socketUrl = rawSocketUrl.endsWith('/') ? rawSocketUrl.slice(0, -1) : rawSocketUrl;
    console.log(`[Socket] Connecting to: ${socketUrl}`);

    socket = io(socketUrl, {
      // polling as fallback — critical for corporate networks and some Safari configs
      transports: ['websocket', 'polling'],
      auth: async (cb) => {
        try {
          const tokenData = await storage.get(StoreName.USER_DATA, 'auth_token');
          cb({ token: tokenData?.value });
        } catch (e) {
          console.error('[Socket] Auth callback error:', e);
          cb({ token: null });
        }
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log(`[Socket] Connected to ${socketUrl} with ID: ${socket?.id}`);
      flushOfflineQueue();
    });

    socket.on('connect_error', (err) => {
      console.error(`[Socket] Connection error for ${socketUrl}:`, err.message);
    });

    socket.on('disconnect', (reason) => {
      console.warn(`[Socket] Disconnected from ${socketUrl}:`, reason);
    });
  }
  return socket;
}

async function flushOfflineQueue() {
  const queue = await storage.getAll(StoreName.OFFLINE_QUEUE);
  if (queue.length === 0) return;
  const s = getSocket();
  for (const action of queue) {
    if (action.type === 'send_message') {
      s.emit('send_message', action.payload);
      await storage.delete(StoreName.OFFLINE_QUEUE, action.id);
    }
  }
}

export async function refreshSocketToken() {
  if (socket) {
    const tokenData = await storage.get(StoreName.USER_DATA, 'auth_token');
    socket.auth = { token: tokenData?.value };
    socket.disconnect().connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Sends a plain text message (encryption disabled mode).
 */
export async function sendSecureMessage(
  chatId: number,
  text: string,
  _signingKeyPair: CryptoKeyPair | null,
  _session: any
) {
  const payload = {
    id: crypto.randomUUID(),
    chatId,
    ciphertext: text,
    encryptedText: text,
    iv: 'PLAIN',
    signature: null,
    ratchetKey: null,
    counter: 0,
  };
  const s = getSocket();
  if (s.connected) {
    s.emit('send_message', payload);
    console.log('Message sent');
  } else {
    await storage.put(StoreName.OFFLINE_QUEUE, {
      id: crypto.randomUUID(),
      type: 'send_message',
      payload,
      timestamp: Date.now()
    });
    console.log('Message queued (offline)');
  }
}

/**
 * Decrypts an incoming message.
 * Encryption is currently disabled — messages are plain text.
 */
export async function decryptSecureMessage(
  message: any,
  _identityKeyPair: CryptoKeyPair | null,
  _remotePublicKey: CryptoKey | null
): Promise<string> {
  // Bot messages
  if (message.sender_is_bot === 1) return message.encrypted_text || message.ciphertext || '';
  // Plain text mode (encryption disabled)
  if (message.iv === 'PLAIN' || message.iv === 'BOT' || !message.iv) {
    return message.encrypted_text || message.ciphertext || '';
  }
  // Encrypted but no session — show placeholder
  return message.encrypted_text || message.ciphertext || '[Message]';
}
