const DATABASE = 'forma-workspace-v1';
const VERSION = 1;
const STORE = 'snapshots';

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('IndexedDB is unavailable; browser storage is read-only.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Browser storage upgrade is blocked by another tab.'));
    };
  });
}

function decode<T>(value: unknown): T {
  if (typeof value !== 'string') throw new Error('Stored browser data is invalid.');
  return JSON.parse(value) as T;
}

export async function readStoredSnapshot<T>(key: string, loadLegacy: () => T): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let value: T | undefined;
    let failure: unknown;
    let hasValue = false;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, 'readwrite');
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    const store = tx.objectStore(STORE);
    const get = store.get(key);
    get.onsuccess = () => {
      try {
        if (get.result !== undefined) value = decode<T>(get.result);
        else {
          value = loadLegacy();
          const put = store.put(JSON.stringify(value), key);
          put.onerror = () => {
            failure = put.error ?? new Error('Could not save migrated browser data.');
          };
        }
        hasValue = true;
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    get.onerror = () => {
      failure = get.error ?? new Error('Could not read browser storage.');
      tx.abort();
    };
    tx.oncomplete = () => {
      db.close();
      if (failure) reject(failure);
      else if (hasValue) resolve(value as T);
      else reject(new Error('Browser storage completed without a snapshot.'));
    };
    tx.onabort = () => {
      db.close();
      reject(failure ?? tx.error ?? new Error('Browser storage read was aborted.'));
    };
    tx.onerror = () => {
      failure ??= tx.error ?? new Error('Could not read browser storage.');
    };
  });
}

export async function updateStoredSnapshot<T, Result>(
  key: string,
  loadLegacy: () => T,
  update: (state: T) => Result,
): Promise<Result> {
  const db = await openDatabase();
  return new Promise<Result>((resolve, reject) => {
    let result: Result | undefined;
    let failure: unknown;
    let hasResult = false;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, 'readwrite');
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    const store = tx.objectStore(STORE);
    const get = store.get(key);
    get.onsuccess = () => {
      try {
        const state = get.result === undefined ? loadLegacy() : decode<T>(get.result);
        result = update(state);
        const put = store.put(JSON.stringify(state), key);
        put.onerror = () => {
          failure = put.error ?? new Error('Could not save browser data.');
        };
        hasResult = true;
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    get.onerror = () => {
      failure = get.error ?? new Error('Could not read browser storage.');
      tx.abort();
    };
    tx.oncomplete = () => {
      db.close();
      if (failure) reject(failure);
      else if (hasResult) resolve(result as Result);
      else reject(new Error('Browser storage completed without an update.'));
    };
    tx.onabort = () => {
      db.close();
      reject(failure ?? tx.error ?? new Error('Browser storage update was aborted.'));
    };
    tx.onerror = () => {
      failure ??= tx.error ?? new Error('Could not update browser storage.');
    };
  });
}
