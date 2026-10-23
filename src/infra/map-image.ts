// Images the player picked, kept only on this PC: IndexedDB of the app's webview (the browser's in
// `npm run dev`), never in the save file, the export or the repository. The map (without one, the
// Map page shows the bundled world map: src/assets/ncsoft/, © NCSOFT, outside the GPL, see its README)
// and the cube popup's "cube opened" picture. Every window of the app shares this storage.
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

/** Who opened the cube: the cube popup has a picture for each. */
export type Opener = "you" | "other";
const cubeKey = (who: Opener) => `cube-opened-${who}`;
/** The picture the cube popup shows when a cube is opened by you / by another player, or undefined. */
export const loadCubePicture = (who: Opener) => run<Blob | undefined>("readonly", (s) => s.get(cubeKey(who)));
export const saveCubePicture = (who: Opener, file: Blob) => run<void>("readwrite", (s) => s.put(file, cubeKey(who)));
export const clearCubePicture = (who: Opener) => run<void>("readwrite", (s) => s.delete(cubeKey(who)));
