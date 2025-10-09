const SALT_KEY = "rps_dev_salt_v1";
const AUDIT_KEY = "rps_dev_audit_v1";
const DATASET_KEY = "rps_dev_dataset_v1";
const DEV_PIN = "02853Adam/@";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKey: CryptoKey | null = null;
let unlocked = false;
const listeners = new Set<() => void>();

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSalt(): Uint8Array {
  if (typeof window === "undefined") return new Uint8Array();
  let salt = localStorage.getItem(SALT_KEY);
  if (!salt) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    salt = base64FromBytes(bytes);
    localStorage.setItem(SALT_KEY, salt);
    return bytes;
  }
  return new Uint8Array(bytesFromBase64(salt));
}

async function deriveKey(pin: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]);
  const saltBuffer = new Uint8Array(salt);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuffer.buffer, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function exportRawKey(key: CryptoKey) {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return base64FromBytes(raw);
}

function notify() {
  listeners.forEach(l => l());
}

export function subscribeSecure(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isUnlocked() {
  return unlocked;
}

export async function unlockWithPin(pin: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (pin !== DEV_PIN) {
    return false;
  }
  const iterations = 150000;
  const salt = getSalt();
  cachedKey = await deriveKey(DEV_PIN, salt, iterations);
  unlocked = true;
  notify();
  return true;
}

export function lockSecureStore() {
  cachedKey = null;
  unlocked = false;
  notify();
}

async function ensureKey(): Promise<CryptoKey> {
  if (!cachedKey) throw new Error("Secure store is locked");
  return cachedKey;
}

export async function loadEncryptedJson<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === "undefined") return fallback;
  if (!unlocked) return fallback;
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    const [ivPart, dataPart] = stored.split(":");
    const iv = bytesFromBase64(ivPart);
    const cipherBytes = bytesFromBase64(dataPart);
    const cryptoKey = await ensureKey();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipherBytes);
    return JSON.parse(decoder.decode(decrypted));
  } catch (err) {
    console.error("Failed to decrypt secure data", err);
    return fallback;
  }
}

export async function saveEncryptedJson(key: string, value: unknown): Promise<void> {
  if (typeof window === "undefined") return;
  if (!unlocked) throw new Error("Secure store is locked");
  const cryptoKey = await ensureKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = encoder.encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, payload);
  const cipherBytes = new Uint8Array(encrypted);
  const data = `${base64FromBytes(iv)}:${base64FromBytes(cipherBytes)}`;
  localStorage.setItem(key, data);
}

export async function loadAuditLog(): Promise<AuditEntry[]> {
  return loadEncryptedJson<AuditEntry[]>(AUDIT_KEY, []);
}

export async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  const logs = await loadAuditLog();
  logs.push(entry);
  await saveEncryptedJson(AUDIT_KEY, logs);
}

export async function saveDatasetSnapshot(payload: unknown): Promise<void> {
  await saveEncryptedJson(DATASET_KEY, payload);
}

export async function loadDatasetSnapshot<T>(fallback: T): Promise<T> {
  return loadEncryptedJson<T>(DATASET_KEY, fallback);
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  actor?: string;
  target?: string;
  notes?: string;
}
