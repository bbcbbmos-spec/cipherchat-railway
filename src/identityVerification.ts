import { bufferToBase64 } from './crypto';

/**
 * Generates a security fingerprint (safety number) for two identity keys.
 * fingerprint = hash(identityKey_A + identityKey_B)
 */
export async function generateFingerprint(localPublicKey: CryptoKey, remotePublicKey: CryptoKey): Promise<string> {
  const localExported = await crypto.subtle.exportKey('spki', localPublicKey);
  const remoteExported = await crypto.subtle.exportKey('spki', remotePublicKey);

  // Sort keys to ensure same fingerprint regardless of who generates it
  const keys = [new Uint8Array(localExported), new Uint8Array(remoteExported)].sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  });

  const combined = new Uint8Array(keys[0].length + keys[1].length);
  combined.set(keys[0]);
  combined.set(keys[1], keys[0].length);

  const hash = await crypto.subtle.digest('SHA-256', combined);
  
  // Return as a formatted numeric string for easy manual verification
  const hashArray = Array.from(new Uint8Array(hash));
  const fingerprint = hashArray.map(b => b.toString().padStart(3, '0')).join('').slice(0, 60);
  
  // Group by 5 for readability: 12345 67890 ...
  return fingerprint.match(/.{1,5}/g)?.join(' ') || fingerprint;
}

/**
 * Verifies a fingerprint against the expected one.
 */
export async function verifyIdentity(localPublicKey: CryptoKey, remotePublicKey: CryptoKey, providedFingerprint: string): Promise<boolean> {
  const expected = await generateFingerprint(localPublicKey, remotePublicKey);
  return expected.replace(/\s/g, '') === providedFingerprint.replace(/\s/g, '');
}
