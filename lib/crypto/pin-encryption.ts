/**
 * AES-256-GCM encryption for judge PINs at rest.
 *
 * Why: judge_secrets.judge_pin_hash (bcrypt) is one-way and great for login
 * verification, but admins need to retrieve PINs to distribute them before
 * the event. This module produces a reversible ciphertext stored alongside
 * the hash. A database leak alone reveals nothing — the attacker also needs
 * PIN_ENCRYPTION_KEY (env var, never in DB).
 *
 * Format on disk (base64): iv (12 bytes) || ciphertext (variable) || authTag (16 bytes)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

function getKey(): Buffer {
  const hex = process.env.PIN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('PIN_ENCRYPTION_KEY env var must be set (64 hex chars / 32 bytes)');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('PIN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== KEY_LENGTH) {
    throw new Error(`PIN_ENCRYPTION_KEY decoded to ${buf.length} bytes, expected ${KEY_LENGTH}`);
  }
  return buf;
}

/**
 * Encrypt a plaintext PIN. Returns a base64 string suitable for direct
 * storage in judge_secrets.judge_pin_encrypted (TEXT column).
 */
export function encryptPin(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64');
}

/**
 * Decrypt a stored ciphertext back to the plaintext PIN. Throws if the
 * ciphertext is tampered with, the key is wrong, or the format is invalid.
 */
export function decryptPin(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Ciphertext is too short to be valid');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
