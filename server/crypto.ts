import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENC_PREFIX = 'enc:v1:';

function deriveKey(rawSecret: string): Buffer {
  return createHash('sha256').update(rawSecret).digest();
}

export function getSecretsKey(): Buffer | null {
  const raw = process.env.ZENFLOW_SECRETS_KEY?.trim();
  if (!raw) return null;
  return deriveKey(raw);
}

export function encryptSecret(plaintext: string | undefined): string | undefined {
  if (!plaintext) return undefined;
  const trimmed = plaintext.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith(ENC_PREFIX)) return trimmed;

  const key = getSecretsKey();
  if (!key) return trimmed;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(stored: string | undefined): string {
  if (!stored) return '';
  const trimmed = stored.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith(ENC_PREFIX)) return trimmed;

  const key = getSecretsKey();
  if (!key) return '';

  try {
    const parts = trimmed.slice(ENC_PREFIX.length).split(':');
    if (parts.length !== 3) return '';
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}
