/**
 * Secure IndexedDB wrapper for PWA storage.
 * No raw keys are stored here.
 */

const DB_NAME = 'cipher_chat_db';
const DB_VERSION = 3;

export enum StoreName {
  IDENTITY_KEYS = 'identity_keys',
  SESSIONS = 'sessions',
  MESSAGES = 'messages',
  OFFLINE_QUEUE = 'offline_queue',
  USER_DATA = 'user_data'
}

export interface StoredMessage {
  id: string;
  chatId: number;
  encryptedText: string;
  iv: string;
  signature: string;
  senderId: number;
  timestamp: number;
  isMine: boolean;
}

export interface OfflineAction {
  id: string;
  type: 'send_message';
  payload: any;
  timestamp: number;
}

export class IndexedDBWrapper {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(StoreName.IDENTITY_KEYS)) {
          db.createObjectStore(StoreName.IDENTITY_KEYS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(StoreName.SESSIONS)) {
          db.createObjectStore(StoreName.SESSIONS, { keyPath: 'chatId' });
        }
        if (!db.objectStoreNames.contains(StoreName.MESSAGES)) {
          const msgStore = db.createObjectStore(StoreName.MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('chatId', 'chatId', { unique: false });
        }
        if (!db.objectStoreNames.contains(StoreName.OFFLINE_QUEUE)) {
          db.createObjectStore(StoreName.OFFLINE_QUEUE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(StoreName.USER_DATA)) {
          db.createObjectStore(StoreName.USER_DATA, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async getStore(name: StoreName, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    await this.init();
    const transaction = this.db!.transaction(name, mode);
    return transaction.objectStore(name);
  }

  async put(storeName: StoreName, value: any): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName: StoreName, key: any): Promise<any> {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName: StoreName): Promise<any[]> {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getByChatId(chatId: number): Promise<StoredMessage[]> {
    const store = await this.getStore(StoreName.MESSAGES);
    const index = store.index('chatId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(chatId));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: StoreName, key: any): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    await this.init();
    const stores = Array.from(this.db!.objectStoreNames);
    const transaction = this.db!.transaction(stores, 'readwrite');
    stores.forEach(name => transaction.objectStore(name).clear());
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve();
    });
  }
}

export const storage = new IndexedDBWrapper();
