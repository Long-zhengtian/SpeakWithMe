const DB_NAME = "speak-with-me";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions");
      if (!db.objectStoreNames.contains("phrases")) db.createObjectStore("phrases");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function ask<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(name: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>) {
  const db = await openDb();
  try {
    const transaction = db.transaction(name, mode);
    const finished = done(transaction);
    const result = await run(transaction.objectStore(name));
    await finished;
    return result;
  } finally {
    db.close();
  }
}

export const store = {
  get<T>(bucket: string, key: string) {
    return transact(bucket, "readonly", (objectStore) => ask<T | undefined>(objectStore.get(key)));
  },
  put(bucket: string, key: string, value: unknown) {
    return transact(bucket, "readwrite", (objectStore) => ask(objectStore.put(value, key)));
  },
  remove(bucket: string, key: string) {
    return transact(bucket, "readwrite", (objectStore) => ask(objectStore.delete(key)));
  },
  all<T>(bucket: string) {
    return transact(bucket, "readonly", (objectStore) => {
      return new Promise<T[]>((resolve, reject) => {
        const collected: T[] = [];
        const request = objectStore.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(collected);
            return;
          }
          collected.push(cursor.value as T);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    });
  },
};
