import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { deriveKeyFromPassword, generateIdentityKeyPair, generateSigningKeyPair, encryptPrivateKey, decryptPrivateKey, bufferToBase64, base64ToBuffer } from './crypto';
import { storage, StoreName } from './storage/indexedDB';
import { disconnectSocket, refreshSocketToken } from './socket';
import { userApi } from './api';

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

interface AuthContextType {
  user: any;
  identityKeyPair: CryptoKeyPair | null;
  signingKeyPair: CryptoKeyPair | null;
  isLocked: boolean;
  login: (userData: any, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [identityKeyPair, setIdentityKeyPair] = useState<CryptoKeyPair | null>(null);
  const [signingKeyPair, setSigningKeyPair] = useState<CryptoKeyPair | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);

  // Reset inactivity timer on user action
  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (user && !isLocked) {
      inactivityTimer.current = setTimeout(() => {
        lock();
      }, LOCK_TIMEOUT);
    }
  };

  const lock = () => {
    // Clear keys from memory
    setIdentityKeyPair(null);
    setSigningKeyPair(null);
    setIsLocked(true);
    console.log('App locked due to inactivity');
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUser = await storage.get(StoreName.USER_DATA, 'current_user');
        const storedToken = await storage.get(StoreName.USER_DATA, 'auth_token');
        
        if (storedUser && storedToken) {
          // Check if token is still valid
          try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/chats`, {
              headers: { 
                'Authorization': `Bearer ${storedToken.value}`,
                'ngrok-skip-browser-warning': 'true'
              }
            });
            if (res.status === 403 || res.status === 401) {
              // Token expired or invalid - clear and show login
              await storage.clearAll();
              setIsLoading(false);
              return;
            }
          } catch (err) {
            console.warn('Token validation check failed', err);
          }
          
          setUser(storedUser);
          setIsLocked(true); // Always start locked if keys are not in memory
        }
      } catch (e) {
        console.error('Auth init error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for activity to reset timer
    const handleActivity = () => resetInactivityTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, []); // Run only once on mount

  const login = async (data: any, password: string) => {
    const { user: userData, token } = data;
    
    await storage.put(StoreName.USER_DATA, { key: 'auth_token', value: token });
    await storage.put(StoreName.USER_DATA, { key: 'current_user', ...userData });
    setUser(userData);
    
    let keys = await storage.get(StoreName.IDENTITY_KEYS, userData.id);
    let salt: ArrayBuffer;

    if (!keys) {
      salt = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
    } else {
      salt = base64ToBuffer(keys.randomSalt || keys.salt);
    }

    const passwordKey = await deriveKeyFromPassword(password, salt);
    
    if (!keys) {
      const idKeyPair = await generateIdentityKeyPair();
      const signKeyPair = await generateSigningKeyPair();
      
      const exportedIdPublic = await crypto.subtle.exportKey('spki', idKeyPair.publicKey);
      const encryptedIdPrivate = await encryptPrivateKey(idKeyPair.privateKey, passwordKey);
      
      const exportedSignPublic = await crypto.subtle.exportKey('spki', signKeyPair.publicKey);
      const encryptedSignPrivate = await encryptPrivateKey(signKeyPair.privateKey, passwordKey);
      
      keys = {
        id: userData.id,
        publicKey: bufferToBase64(exportedIdPublic),
        encryptedPrivateKey: encryptedIdPrivate.ciphertext,
        iv: encryptedIdPrivate.iv,
        signingPublicKey: bufferToBase64(exportedSignPublic),
        encryptedSigningPrivateKey: encryptedSignPrivate.ciphertext,
        signingIv: encryptedSignPrivate.iv,
        randomSalt: bufferToBase64(salt)
      };
      
      await storage.put(StoreName.IDENTITY_KEYS, keys);
      await userApi.updatePublicKey(keys.publicKey);
      
      setIdentityKeyPair(idKeyPair);
      setSigningKeyPair(signKeyPair);
    } else {
      await unlockWithKeys(keys, passwordKey);
    }

    setIsLocked(false);
    refreshSocketToken();
    resetInactivityTimer();
  };

  const unlock = async (password: string) => {
    if (!user) return;
    
    const keys = await storage.get(StoreName.IDENTITY_KEYS, user.id);
    if (!keys) throw new Error('No keys found for user');
    
    const salt = base64ToBuffer(keys.randomSalt || keys.salt);
    const passwordKey = await deriveKeyFromPassword(password, salt);
    
    await unlockWithKeys(keys, passwordKey);
    setIsLocked(false);
    resetInactivityTimer();
  };

  const unlockWithKeys = async (keys: any, passwordKey: CryptoKey) => {
    const idPrivateKey = await decryptPrivateKey(
      keys.encryptedPrivateKey,
      keys.iv,
      passwordKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      ['deriveKey', 'deriveBits']
    );
    
    const idPublicKey = await crypto.subtle.importKey(
      'spki',
      base64ToBuffer(keys.publicKey),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    const signPrivateKey = await decryptPrivateKey(
      keys.encryptedSigningPrivateKey!,
      keys.signingIv!,
      passwordKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      ['sign']
    );
    
    const signPublicKey = await crypto.subtle.importKey(
      'spki',
      base64ToBuffer(keys.signingPublicKey!),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );
    
    setIdentityKeyPair({ publicKey: idPublicKey, privateKey: idPrivateKey });
    setSigningKeyPair({ publicKey: signPublicKey, privateKey: signPrivateKey });
  };

  const logout = async () => {
    setUser(null);
    setIdentityKeyPair(null);
    setSigningKeyPair(null);
    setIsLocked(false);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    
    await storage.clearAll();
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, identityKeyPair, signingKeyPair, isLocked, login, unlock, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
