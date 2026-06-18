// IndexedDB persistence for the destination device's credentials. We store the
// non-extractable AES CryptoKey object directly (structured-clone keeps it
// opaque to JS), alongside the bearer deviceToken and push subscription.

import type { DeviceCredentials } from "../types";

const DB_NAME = "otp-relay";
const DB_VERSION = 1;
const STORE = "device";
const KEY = "self"; // single-record store: this browser is one device

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const req = fn(transaction.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function getDeviceCredentials(): Promise<DeviceCredentials | null> {
  const rec = await tx<DeviceCredentials | undefined>("readonly", (s) =>
    s.get(KEY),
  );
  return rec ?? null;
}

export async function saveDeviceCredentials(
  creds: DeviceCredentials,
): Promise<void> {
  await tx("readwrite", (s) => s.put(creds, KEY));
}

export async function clearDeviceCredentials(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY));
}

export async function isRegistered(): Promise<boolean> {
  return (await getDeviceCredentials()) !== null;
}

/**
 * Requests persistent storage so the browser won't evict our credentials under
 * storage pressure. Installed PWAs are usually granted this automatically.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    return navigator.storage.persist();
  }
  return false;
}
