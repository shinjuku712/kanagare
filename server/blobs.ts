import type { Readable } from 'node:stream';
import { db } from './db.ts';

/**
 * Where attachment bytes live. The DB only holds metadata; the bytes go to
 * whichever store the runtime installs at startup — a directory on disk under
 * Node (server/blobs-fs.ts), SQLite rows inside a Durable Object on Cloudflare
 * (worker/blobs.ts). Keys are content-addressed, so a key's bytes never change.
 */
export interface BlobStore {
  has(key: string): boolean;
  put(key: string, bytes: Buffer): void;
  /** A stream of the bytes, or null when the key is missing from storage. */
  open(key: string): Readable | null;
  delete(key: string): void;
}

let store: BlobStore | null = null;

export function useBlobStore(s: BlobStore): void {
  store = s;
}

export function blobs(): BlobStore {
  if (!store) throw new Error('No blob store installed');
  return store;
}

/** Storage keys of the files attached to the cards matched by `cardsWhere`. */
export function fileKeysForCards(cardsWhere: string, param: number): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT storage_key AS k FROM attachments
         WHERE storage_key IS NOT NULL AND card_id IN (SELECT id FROM cards WHERE ${cardsWhere})`,
      )
      .all(param) as { k: string }[]
  ).map((r) => r.k);
}

/**
 * Delete the stored bytes for keys no attachment points at any more. Call it
 * after deleting rows: identical uploads share one blob, so a key can still be
 * in use by another card.
 */
export function dropUnusedBlobs(keys: string[]): void {
  for (const key of keys) {
    if (!db.prepare('SELECT 1 FROM attachments WHERE storage_key = ? LIMIT 1').get(key)) blobs().delete(key);
  }
}
