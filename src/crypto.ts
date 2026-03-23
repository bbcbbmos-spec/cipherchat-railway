/**
 * Core cryptography logic using Web Crypto API.
 * 
 * SECURITY RULES:
 * - No keys are stored in localStorage.
 * - Private keys are encrypted at rest (IndexedDB) using a password-derived key.
 * - Decrypted keys exist only in memory (RAM) and are cleared on logout or inactivity.
 * - PBKDF2 iterations: 600,000.
 * - HKDF with unique "info" values for root, chain, and message keys.
 * - Secure random salt (32 bytes) for HKDF.
 */

const PBKDF2_ITERATIONS = 600000; // Hardened iterations
const AES_GCM_IV_LENGTH = 12;
const SALT_LENGTH = 32; // Hardened salt length

/**
 * Utility to convert ArrayBuffer to Base64.
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Utility to convert Base64 to ArrayBuffer.
 */
export function base64ToBuffer(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}

/**
 * Derives a key from a password using PBKDF2.
 */
export async function deriveKeyFromPassword(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates an identity key pair (P-256).
 */
export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Generates a signing key pair (P-256).
 */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );
}

/**
 * Encrypts a private key using a password-derived key.
 */
export async function encryptPrivateKey(privateKey: CryptoKey, passwordKey: CryptoKey): Promise<{ ciphertext: string, iv: string }> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    passwordKey,
    exported
  );

  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv.buffer)
  };
}

/**
 * Decrypts a private key using a password-derived key.
 */
export async function decryptPrivateKey(ciphertext: string, iv: string, passwordKey: CryptoKey, algorithm: any, usages: KeyUsage[]): Promise<CryptoKey> {
  const encrypted = base64ToBuffer(ciphertext);
  const ivBuffer = base64ToBuffer(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    passwordKey,
    encrypted
  );

  return crypto.subtle.importKey(
    'pkcs8',
    decrypted,
    algorithm,
    true,
    usages
  );
}

/**
 * Encrypts a file with AES-GCM.
 */
export async function encryptFile(file: File, key: CryptoKey): Promise<{ encryptedBlob: Blob, iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const fileData = await file.arrayBuffer();
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileData
  );
  return {
    encryptedBlob: new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
    iv: bufferToBase64(iv.buffer)
  };
}

/**
 * Decrypts a file with AES-GCM.
 */
export async function decryptFile(encryptedBlob: Blob, key: CryptoKey, ivBase64: string): Promise<Blob> {
  const iv = new Uint8Array(base64ToBuffer(ivBase64));
  const encryptedBuffer = await encryptedBlob.arrayBuffer();
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedBuffer
  );
  return new Blob([decryptedBuffer]);
}

/**
 * Derives a shared secret using ECDH.
 */
export async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    256
  );
}

/**
 * Signs a message using ECDSA.
 */
export async function signMessage(privateKey: CryptoKey, data: ArrayBuffer): Promise<string> {
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );
  return bufferToBase64(signature);
}

/**
 * Verifies a message signature using ECDSA.
 */
export async function verifySignature(publicKey: CryptoKey, signature: string, data: ArrayBuffer): Promise<boolean> {
  const signatureBuffer = base64ToBuffer(signature);
  return crypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    publicKey,
    signatureBuffer,
    data
  );
}

/**
 * Encrypts data with AES-256-GCM.
 */
export async function encryptAES(key: CryptoKey, data: ArrayBuffer): Promise<{ ciphertext: string, iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv.buffer)
  };
}

/**
 * Decrypts data with AES-256-GCM.
 */
export async function decryptAES(key: CryptoKey, ciphertext: string, iv: string): Promise<ArrayBuffer> {
  const encrypted = base64ToBuffer(ciphertext);
  const ivBuffer = base64ToBuffer(iv);

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    key,
    encrypted
  );
}

/**
 * HKDF derivation for various keys.
 * info: "root-key", "chain-key", "message-key"
 */
export async function kdf(key: ArrayBuffer, info: string, salt: Uint8Array = new Uint8Array(SALT_LENGTH)): Promise<ArrayBuffer> {
  const importedKey = await crypto.subtle.importKey(
    'raw',
    key,
    'HKDF',
    false,
    ['deriveBits']
  );

  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode(info),
    },
    importedKey,
    256
  );
}

/**
 * Generates a random salt.
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}
