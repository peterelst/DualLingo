import type { TranscriptSegment } from "@/types/youtube";

const DATABASE_NAME = "duallingo-video-library";
const STORE_NAME = "videos";
const DATABASE_VERSION = 1;

export interface SavedVideoLibraryEntry {
  id: string;
  videoId: string;
  thumbnailUrl: string;
  segments: TranscriptSegment[];
  firstTrackLabel: string;
  secondTrackLabel: string;
  firstTrackCode: string;
  secondTrackCode: string;
  title: string;
  subtitle: string;
  createdAt: string;
}

const hasIndexedDb = () => typeof window !== "undefined" && "indexedDB" in window;

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T,
) => {
  const database = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      database.close();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
      database.close();
    };

    Promise.resolve(callback(store)).then(resolve).catch(reject);
  });
};

export const listSavedVideos = async () => {
  if (!hasIndexedDb()) {
    return [] as SavedVideoLibraryEntry[];
  }

  return withStore("readonly", (store) =>
    new Promise<SavedVideoLibraryEntry[]>((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error ?? new Error("Failed to load saved videos"));
      request.onsuccess = () => {
        const result = (request.result as SavedVideoLibraryEntry[]).sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        );
        resolve(result);
      };
    }),
  );
};

export const saveVideo = async (entry: SavedVideoLibraryEntry) => {
  if (!hasIndexedDb()) {
    return;
  }

  await withStore("readwrite", (store) =>
    new Promise<void>((resolve, reject) => {
      const request = store.put(entry);
      request.onerror = () => reject(request.error ?? new Error("Failed to save video"));
      request.onsuccess = () => resolve();
    }),
  );
};

export const deleteVideo = async (id: string) => {
  if (!hasIndexedDb()) {
    return;
  }

  await withStore("readwrite", (store) =>
    new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(request.error ?? new Error("Failed to delete video"));
      request.onsuccess = () => resolve();
    }),
  );
};
