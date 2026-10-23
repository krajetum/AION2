// The player's map image, kept only on this PC: IndexedDB of the app's webview (the browser's in
// `npm run dev`). Never in the save file, the export or the repository: the game's map art is NCSOFT's.
const DB = "aion2-companion-map", STORE = "files", KEY = "map";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const r = f(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  }));
}

/** The saved image, or undefined. */
export const loadMapImage = () => run<Blob | undefined>("readonly", (s) => s.get(KEY));
export const saveMapImage = (file: Blob) => run<void>("readwrite", (s) => s.put(file, KEY));
export const clearMapImage = () => run<void>("readwrite", (s) => s.delete(KEY));
