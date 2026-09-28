import { Readable } from 'node:stream';
import type { BlobStore } from '../server/blobs.ts';
import { doDatabase as db } from './sqlite.ts';

/**
 * Attachment bytes as rows in the Durable Object's own SQLite database, so an
 * instance needs no R2 bucket (which requires a card on file, even on the free
 * tier). A row or value is capped at 2 MB there, so blobs are split into 1 MB
 * chunks keyed by (key, idx).
 */
const CHUNK = 1024 * 1024;

export function ensureBlobTable(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS blob_chunks (
    key TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (key, idx)
  )`);
}

export const sqliteBlobStore: BlobStore = {
  has: (key) => !!db.prepare('SELECT 1 FROM blob_chunks WHERE key = ? LIMIT 1').get(key),
  put(key, bytes) {
    db.transaction(() => {
      db.prepare('DELETE FROM blob_chunks WHERE key = ?').run(key);
      const insert = db.prepare('INSERT INTO blob_chunks (key, idx, data) VALUES (?, ?, ?)');
      for (let i = 0; i * CHUNK < bytes.length; i++) {
        const part = bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
        // DO SQLite binds BLOBs from an ArrayBuffer, not a Buffer view.
        insert.run(key, i, part.buffer.slice(part.byteOffset, part.byteOffset + part.length));
      }
    })();
  },
  open(key) {
    if (!sqliteBlobStore.has(key)) return null;
    const count = (db.prepare('SELECT COUNT(*) AS n FROM blob_chunks WHERE key = ?').get(key) as { n: number }).n;
    // One chunk per read, so a 25 MB file isn't held in memory all at once.
    let i = 0;
    return new Readable({
      read() {
        if (i >= count) return void this.push(null);
        const row = db.prepare('SELECT data FROM blob_chunks WHERE key = ? AND idx = ?').get(key, i++) as {
          data: ArrayBuffer;
        };
        this.push(Buffer.from(row.data));
      },
    });
  },
  delete(key) {
    db.prepare('DELETE FROM blob_chunks WHERE key = ?').run(key);
  },
};
