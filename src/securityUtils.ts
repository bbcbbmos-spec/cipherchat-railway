import { storage, StoreName } from './storage/indexedDB';
import { disconnectSocket } from './socket';

/**
 * Clears all sensitive keys from memory and storage.
 * Should be called on logout, tab close, or inactivity timeout.
 */
export async function clearKeys(onClear?: () => void) {
  // 1. Disconnect socket
  disconnectSocket();

  // 2. Clear IndexedDB (all keys, sessions, and user data)
  await storage.clearAll();

  // 3. Notify app to clear React state
  if (onClear) onClear();
}

/**
 * Inactivity timeout logic.
 */
let inactivityTimer: NodeJS.Timeout | null = null;
const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes

export function resetInactivityTimer(onTimeout: () => void) {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    console.warn('Inactivity timeout reached. Clearing keys...');
    onTimeout();
  }, INACTIVITY_LIMIT);
}

/**
 * Replay protection: tracks processed message IDs using IndexedDB.
 */
export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  try {
    const existing = await storage.get(StoreName.MESSAGES, messageId);
    return !!existing;
  } catch {
    return false;
  }
}
