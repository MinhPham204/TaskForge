import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encryptOutboxInvitationCredential(token: string): Record<string, string> {
  const key = credentialKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    encryption: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptOutboxInvitationCredential(credential: Record<string, unknown>): string {
  if (
    credential.encryption !== 'AES-256-GCM' ||
    typeof credential.iv !== 'string' ||
    typeof credential.tag !== 'string' ||
    typeof credential.ciphertext !== 'string'
  ) {
    throw new Error('Outbox invitation credential is invalid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', credentialKey(), Buffer.from(credential.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(credential.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(credential.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function credentialKey(): Buffer {
  const value = process.env.OUTBOX_INVITATION_CREDENTIAL_KEY_BASE64 ??
    (process.env.NODE_ENV === 'test' ? 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' : undefined);
  if (!value) throw new Error('OUTBOX_INVITATION_CREDENTIAL_KEY_BASE64 is required.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('OUTBOX_INVITATION_CREDENTIAL_KEY_BASE64 must decode to 32 bytes.');
  return key;
}
