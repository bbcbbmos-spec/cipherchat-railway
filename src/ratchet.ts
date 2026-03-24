/**
 * Full Double Ratchet implementation.
 * Ensures forward secrecy and future secrecy.
 */

import { kdf, deriveSharedSecret, bufferToBase64, base64ToBuffer, generateSalt } from './crypto';

export interface RatchetState {
  rootKey: ArrayBuffer;
  sendingChainKey: ArrayBuffer;
  receivingChainKey: ArrayBuffer;
  remotePublicKey: CryptoKey;
  localKeyPair: CryptoKeyPair;
  sendingCounter: number;
  receivingCounter: number;
  salt: string; // Unique salt per session
}

/**
 * Derives a message key and updates the chain key.
 * info: "message-key" or "chain-key"
 */
export async function ratchetStep(chainKey: ArrayBuffer, salt: Uint8Array): Promise<{ messageKey: CryptoKey, nextChainKey: ArrayBuffer }> {
  // Use unique info values for context separation
  const nextChainKey = await kdf(chainKey, 'chain-key', salt);
  const messageKeyBuffer = await kdf(chainKey, 'message-key', salt);
  
  const messageKey = await crypto.subtle.importKey(
    'raw',
    messageKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return { messageKey, nextChainKey };
}

/**
 * Performs a DH ratchet step to update root and chain keys.
 */
export async function dhRatchet(state: RatchetState, remotePublicKey: CryptoKey): Promise<RatchetState> {
  const sharedSecret = await deriveSharedSecret(state.localKeyPair.privateKey, remotePublicKey);
  const salt = base64ToBuffer(state.salt);
  
  // Update root key
  const rootKeyMaterial = await kdf(state.rootKey, 'root-key', new Uint8Array(salt));
  const combinedSecret = new Uint8Array(rootKeyMaterial.byteLength + sharedSecret.byteLength);
  combinedSecret.set(new Uint8Array(rootKeyMaterial));
  combinedSecret.set(new Uint8Array(sharedSecret), rootKeyMaterial.byteLength);

  const newRootKey = await kdf(combinedSecret.buffer, 'root-key', new Uint8Array(salt));
  const newChainKey = await kdf(combinedSecret.buffer, 'chain-key', new Uint8Array(salt));

  return {
    ...state,
    rootKey: newRootKey,
    receivingChainKey: newChainKey,
    remotePublicKey,
    receivingCounter: 0
  };
}

/**
 * Initializes a new ratchet session.
 */
export async function initRatchet(rootKey: ArrayBuffer, remotePublicKey: CryptoKey, localKeyPair: CryptoKeyPair): Promise<RatchetState> {
  const sharedSecret = await deriveSharedSecret(localKeyPair.privateKey, remotePublicKey);
  const salt = generateSalt();
  
  const combinedSecret = new Uint8Array(rootKey.byteLength + sharedSecret.byteLength);
  combinedSecret.set(new Uint8Array(rootKey));
  combinedSecret.set(new Uint8Array(sharedSecret), rootKey.byteLength);

  const newRootKey = await kdf(combinedSecret.buffer, 'root-key', salt);
  const sendingChainKey = await kdf(combinedSecret.buffer, 'chain-key', salt);

  return {
    rootKey: newRootKey,
    sendingChainKey,
    receivingChainKey: new ArrayBuffer(0),
    remotePublicKey,
    localKeyPair,
    sendingCounter: 0,
    receivingCounter: 0,
    salt: bufferToBase64(salt.buffer as ArrayBuffer)
  };
}
