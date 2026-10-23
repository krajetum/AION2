// A map image the player imported, kept only on this PC: IndexedDB of the app's webview (the
// browser's in `npm run dev`), never in the save file or the export. Without one, the Map page shows
// the bundled world map (src/assets/ncsoft/, © NCSOFT, outside the GPL: see its README).
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
