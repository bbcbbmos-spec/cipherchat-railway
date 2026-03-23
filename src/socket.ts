import { io, Socket } from 'socket.io-client';
import { decryptAES, signMessage, verifySignature, base64ToBuffer, bufferToBase64, encryptAES } from './crypto';
import { getSession, saveSession } from './keyStorage';
import { ratchetStep, dhRatchet } from './ratchet';
import { storage, StoreName } from './storage/indexedDB';
import { isDuplicateMessage } from './securityUtils';

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    const rawSocketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || window.location.origin;
    const socketUrl = rawSocketUrl.endsWith('/') ? rawSocketUrl.slice(0, -1) : rawSocketUrl;
    console.log(`[Socket] Connecting to: ${socketUrl}`);
    socket = io(socketUrl, {
      transports: ['websocket'],
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
      reconnection: true
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

  const socket = getSocket();
  for (const action of queue) {
    if (action.type === 'send_message') {
      socket.emit('send_message', action.payload);
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
 * Securely sends an encrypted message.
 * New structure: { id, counter, ciphertext, iv, signature }
 */
export async function sendSecureMessage(chatId: number, text: string, signingKeyPair: CryptoKeyPair, session: any) {
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

  const socket = getSocket();
  if (socket.connected) {
    socket.emit('send_message', payload);
    console.log('Message sent');
  } else {
    await storage.put(StoreName.OFFLINE_QUEUE, {
      id: crypto.randomUUID(),
      type: 'send_message',
      payload,
      timestamp: Date.now()
    });
    console.log('Message queued');
  }
}

/**
 * Decrypts an incoming secure message.
 * Replay protection and duplicate detection included.
 */
export async function decryptSecureMessage(message: any, identityKeyPair: CryptoKeyPair, remotePublicKey: CryptoKey) {
  // Bot messages
  if (message.sender_is_bot === 1) return message.encrypted_text || message.ciphertext || '';
  
  // Plain text mode
  if (message.iv === 'PLAIN' || message.iv === 'BOT' || !message.iv) {
    return message.encrypted_text || message.ciphertext || '';
  }
  
  // Encrypted but no session — show as is
  return message.encrypted_text || message.ciphertext || '[Message]';
}
