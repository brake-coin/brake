export const MAX_GALLERY_ITEMS = 12;

const DATABASE_NAME = "stopai-meme-gallery";
const DATABASE_VERSION = 1;
const STORE_NAME = "memes";

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Browser gallery storage is unavailable."));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => {
        request.result.addEventListener("versionchange", () => request.result.close());
        resolve(request.result);
      }, { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
  }
  return databasePromise;
}

export function sortGalleryItems(items) {
  return [...items].sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  ));
}

export async function listGalleryMemes() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const done = transactionDone(transaction);
  const items = await requestResult(transaction.objectStore(STORE_NAME).getAll());
  await done;
  return sortGalleryItems(items).slice(0, MAX_GALLERY_ITEMS);
}

export async function saveGalleryMeme({ image, idea, style, createdAt = new Date().toISOString() }) {
  if (!String(image || "").startsWith("data:image/")) {
    throw new Error("Only generated images can be saved in the gallery.");
  }
  const item = {
    id: globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    image,
    idea: String(idea || "Untitled STOPAI meme").trim().slice(0, 280),
    style: String(style || "reaction").slice(0, 40),
    createdAt
  };
  const database = await openDatabase();
  let transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(item);
  await transactionDone(transaction);

  const items = await listGalleryMemes();
  const allTransaction = database.transaction(STORE_NAME, "readonly");
  const allDone = transactionDone(allTransaction);
  const allItems = sortGalleryItems(await requestResult(allTransaction.objectStore(STORE_NAME).getAll()));
  await allDone;
  const overflow = allItems.slice(MAX_GALLERY_ITEMS);
  if (overflow.length) {
    transaction = database.transaction(STORE_NAME, "readwrite");
    for (const oldItem of overflow) transaction.objectStore(STORE_NAME).delete(oldItem.id);
    await transactionDone(transaction);
  }
  return { item, items };
}

export async function deleteGalleryMeme(id) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(String(id));
  await transactionDone(transaction);
}

export async function clearGalleryMemes() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).clear();
  await transactionDone(transaction);
}
