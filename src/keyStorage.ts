import { storage, StoreName } from './storage/indexedDB';

/**
 * Secure key storage wrapper.
 * CRITICAL: Private keys must be encrypted BEFORE calling these functions.
 */

export async function saveSession(state: any) {
  // Sessions contain sensitive chain keys, ensure they are handled carefully
  return storage.put(StoreName.SESSIONS, state);
}

export async function getSession(chatId: number) {
  return storage.get(StoreName.SESSIONS, chatId);
}

export async function clearAllKeys() {
  return storage.clearAll();
}

export async function saveIdentityKeys(keys: any) {
  // keys object should contain encryptedPrivateKey and iv
  return storage.put(StoreName.IDENTITY_KEYS, keys);
}

export async function getIdentityKeys(userId: number) {
  return storage.get(StoreName.IDENTITY_KEYS, userId);
}
