const SALT_KEY = "rps_dev_salt_v1";
const AUDIT_KEY = "rps_dev_audit_v1";
const DATASET_KEY = "rps_dev_dataset_v1";
const AUTOMATION_UNLOCK_KEY = "rps_dev_automation_unlock_v1";
const AUTOMATION_UNLOCK_TOKEN = "codex-telemetry-check";
const DEV_PIN = "02853Adam/@";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKey: CryptoKey | null = null;
let unlocked = false;
let automationUnlocked = false;
const listeners = new Set<() => void>();

function isAutomationUnlockHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "host.docker.internal";
}

export function getSecureUnlockDiagnostics() {
  if (typeof window === "undefined") {
    return {
      environment: "server",
      isSecureContext: false,
      hasCrypto: false,
      hasSubtle: false,
      webdriver: false,
      hostname: null,
      automationRequested: false,
      automationAllowedHost: false,
    };
  }
  const hostname = window.location.hostname;
  const automationRequested = window.localStorage.getItem(AUTOMATION_UNLOCK_KEY) === AUTOMATION_UNLOCK_TOKEN;
  return {
    environment: "browser",
    isSecureContext: window.isSecureContext,
    hasCrypto: !!window.crypto,
    hasSubtle: !!window.crypto?.subtle,
    webdriver: navigator.webdriver,
    hostname,
    automationRequested,
    automationAllowedHost: isAutomationUnlockHost(hostname),
  };
}

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

export function isAutomationUnlocked() {
  return automationUnlocked;
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
  automationUnlocked = false;
  notify();
  return true;
}

export function tryAutomationUnlock() {
  const diagnostics = getSecureUnlockDiagnostics();
  if (diagnostics.environment !== "browser") {
    return { attempted: false, success: false, reason: "server" as const, diagnostics };
  }
  if (!diagnostics.automationRequested) {
    return { attempted: false, success: false, reason: "not-requested" as const, diagnostics };
  }
  if (!diagnostics.webdriver) {
    return { attempted: true, success: false, reason: "webdriver-required" as const, diagnostics };
  }
  if (!diagnostics.automationAllowedHost) {
    return { attempted: true, success: false, reason: "host-not-allowed" as const, diagnostics };
  }

  // In browser automation on local-only hosts, allow a read-only unlock path even
  // when WebCrypto secure-context APIs are unavailable. This keeps the production
  // PIN flow intact while making deterministic telemetry verification possible.
  unlocked = true;
  automationUnlocked = true;
  cachedKey = null;
  notify();
  return { attempted: true, success: true, reason: "automation-unlocked" as const, diagnostics };
}

export function lockSecureStore() {
  cachedKey = null;
  unlocked = false;
  automationUnlocked = false;
  notify();
}

async function ensureKey(): Promise<CryptoKey> {
  if (!cachedKey) throw new Error("Secure store is locked");
  return cachedKey;
}

export async function loadEncryptedJson<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === "undefined") return fallback;
  if (!unlocked) return fallback;
  if (automationUnlocked && !cachedKey) return fallback;
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
  if (automationUnlocked && !cachedKey) {
    throw new Error("Secure store write disabled in automation unlock mode");
  }
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
